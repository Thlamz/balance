import {collectState, StateArray} from "./state";
import DroneEntity from "./drone";
import Wind from "./wind";
import * as tf from "@tensorflow/tfjs"
import {Memory, MemoryBuffer} from "./memoryBuffer";
import {ACTION_SIZE, applyAction} from "./action";
import {Scene} from "@babylonjs/core/scene";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {Actor} from "./actor.ts";
import {Critic} from "./critic.ts";
import {HavokPlugin} from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";

interface Configuration {
    stepInterval: number,
    trainingSteps: number
    memorySize: number
    batchSize: number,
    actorUpdateInterval: number
    gamma: number
    hiddenLayerSize: number
    numHiddenLayers: number
    boundDiameter: number
    epsilonDecay: number,
    episodeLimit: number
    tau: number,
    actorLR: number,
    criticLR: number,
}



export class Orchestrator {
    scene: Scene
    physics: HavokPlugin
    drone: DroneEntity
    wind: Wind
    currentState: StateArray | null
    currentAction: number[] | null

    config: Configuration

    interval: number | undefined

    epsilon: number

    memory: MemoryBuffer

    actorMain: Actor;
    actorTarget: Actor;

    criticMain: Critic
    criticTarget: Critic

    currentEpisodeDuration: number

    trainingStep: number

    avgReward: number = 0
    rewardCounts: number = 0;

    actorLosses: number[] = []
    criticLosses: number[] = []
    avgRewards: number[] = []

    constructor(scene: Scene,
                drone: DroneEntity,
                wind: Wind,
                physics: HavokPlugin,
                config: Configuration,
                train = true) {
        this.scene = scene
        this.physics = physics
        this.drone = drone
        this.wind = wind
        this.config = config

        this.memory = new MemoryBuffer(config['memorySize'])

        this.actorMain = new Actor(this.config.numHiddenLayers, this.config.hiddenLayerSize, this.config.actorLR)
        this.actorTarget = new Actor(this.config.numHiddenLayers, this.config.hiddenLayerSize, this.config.actorLR)
        this.actorTarget.loadWeights(this.actorMain.getWeights())

        this.criticMain = new Critic(this.config.numHiddenLayers, this.config.hiddenLayerSize, this.config.criticLR)
        this.criticTarget = new Critic(this.config.numHiddenLayers, this.config.hiddenLayerSize, this.config.criticLR)
        this.criticTarget.loadWeights(this.criticMain.getWeights())

        this.trainingStep = 0
        this.epsilon = 0

        this.shouldTrain = train

        this.currentState = null
        this.currentAction = null

        this.currentEpisodeDuration = 0

        scene.onBeforePhysicsObservable.add(async () => {
            if(drone.mesh.absolutePosition.lengthSquared() > (config.boundDiameter/2) * (config.boundDiameter/2)) {
                this.resetEpisode()
            }
        })

        window.addEventListener("keypress", (event) => {
            if(event.key == "r") {
                this.resetEpisode(false)
            }
        })
    }

    _optimize: boolean = false
    get shouldTrain() {
        return this._optimize
    }

    plot() {
        const x = this.criticLosses.map((_v, i) => i)
        const maxCritic = Math.max(...this.criticLosses)
        const trace1: Plotly.Data = {
            x,
            y: this.criticLosses.map(l => l / maxCritic),
            type: 'scatter',
            name: "Critic Loss"
        };
        const trace2: Plotly.Data = {
            x,
            y: this.actorLosses,
            type: 'scatter',
            name: "Actor Loss"
        };
        const trace3: Plotly.Data = {
            x,
            y: this.avgRewards,
            type: 'scatter',
            name: "Avg Rewards"
        };


        const data = [trace1, trace2, trace3];
        // @ts-ignore
        Plotly.newPlot('plot', data);
    }

    set shouldTrain(value: boolean) {
        if(value) {
            this.epsilon = 1
        } else {
            this.epsilon = 0

            // If it was training and is not anymore, saves the model
            if(this.shouldTrain) {
                this.actorMain.save().then(() => console.log("ACTOR EXPORTED"));
                this.criticMain.save().then(() => console.log("CRITIC EXPORTED"));

                this.plot()
            }
        }
        this.trainingStep = 0
        this.currentEpisodeDuration = 0
        this.memory.clear()
        this._optimize = value
    }

    async loadModel(actor: string, critic: string) {
        const isTraining = this.shouldTrain
        this.shouldTrain = false
        await this.actorMain.load(actor)
        await this.criticMain.load(critic)
        this.shouldTrain = isTraining
    }

    start() {
        this.interval = window.setTimeout(() => this.loop(), this.config.stepInterval)
    }

    stop() {
        clearInterval(this.interval)
    }

    /**
     * The negative normalized distance squared to the center of the scene
     */
    computeReward(drone: DroneEntity): number {
        const centerVector = drone.physics.transformNode.absolutePosition
        const newVelocityVector = drone.physics.body.getLinearVelocity()

        if (centerVector.length() <= 1 && newVelocityVector.length() <= 0.3) {
            return 1
        }

        return -Math.abs(1 - Vector3.Dot(newVelocityVector.normalizeToNew(), centerVector.normalizeToNew().scale(-1)))
    }

    choose(state: StateArray): number[] {
        if (Math.random() > this.epsilon || !this.shouldTrain) {
            this.log(`CHOICE (e=${this.epsilon.toFixed(3)}) - PREDICTED`)
            const prediction: tf.Tensor = this.actorMain.predict(tf.tensor(state)).flatten()
            return <number[]>prediction.arraySync()
        } else {
            this.log(`CHOICE (e=${this.epsilon.toFixed(3)}) - RNG`)
            return new Array(ACTION_SIZE).fill(0).map(() => Math.random() * 2 - 1)
        }
    }

    private async optimize (nextState: StateArray) {
        this.epsilon = Math.exp(-1. * this.trainingStep / this.config.epsilonDecay)

        if(this.currentState === null || this.currentAction === null || this.trainingStep >= this.config.trainingSteps) {
            return
        }

        const reward = this.computeReward(this.drone)

        this.rewardCounts += 1
        this.avgReward = (this.avgReward * (this.rewardCounts - 1) + reward) / this.rewardCounts
        this.log(`REWARD = ${reward}`)
        this.log(`AVG REWARD = ${this.avgReward}`)

        this.memory.add(this.currentState, nextState, this.currentAction, reward)
        this.log(`ADDED TO MEMORY (${this.memory.size}): ` + [this.currentAction, reward])
        if (this.memory.size > this.config.batchSize) {
            this.log("OPTIMIZING")
            const samples: Memory[] = this.memory.sample(this.config.batchSize)

            const rewards =samples.map(memory => memory[3])

            const stateBatch = tf.tensor(samples.map((memory) => memory[0]))
            const nextStateBatch = tf.tensor(<StateArray[]> samples
                .map((memory) => memory[1]))
            const actionBatch = tf.tensor(samples.map(m => m[2]),
                [this.config.batchSize, ACTION_SIZE])
            const rewardsBatch = tf.tensor(rewards, [this.config.batchSize, 1])
            const terminalBatch = tf.tensor(
                samples.map(m => +m[4]),
                [this.config.batchSize, 1]
            )

            const targetActions = this.actorTarget.predict(nextStateBatch)
            const targetNextStateValues = this.criticTarget.predict(nextStateBatch, targetActions)

            const discountedNextStateValues = targetNextStateValues.mul(this.config.gamma)
            const terminalNextStateValues = discountedNextStateValues.mul(terminalBatch)
            const targetValues = terminalNextStateValues.add(rewardsBatch)
            const criticInfo = await this.criticMain.optimize(stateBatch, actionBatch, targetValues);
            const actorInfo = await this.actorMain.optimize(stateBatch, this.criticMain)

            this.log(`CRITIC LOSS = ${criticInfo}`)
            this.log(`ACTOR LOSS = ${actorInfo}`)
            this.avgRewards.push(this.avgReward)
            this.actorLosses.push(actorInfo)
            this.criticLosses.push(criticInfo)

            this.updateWeights()
        }
    }

    async loop () {
        tf.engine().startScope()
        this.physics.setTimeStep(0)
        this.log(`------------- STEP ${this.trainingStep} ---------------`)
        const nextState = collectState(this.drone, this.config.boundDiameter/2, this.wind)
        const action = this.choose(nextState)
        this.log(action)
        applyAction(action, this.drone)

        if (this.shouldTrain) {
            await this.optimize(nextState)
        }


        this.currentState = nextState
        this.currentAction = action

        this.trainingStep++
        this.currentEpisodeDuration++

        if(this.currentEpisodeDuration >= this.config.episodeLimit) {
            this.resetEpisode(false)
        }

        if(this.trainingStep === this.config.trainingSteps) {
            this.shouldTrain = false
        }

        this.flush()
        this.interval = window.setTimeout(() => this.loop(), this.config.stepInterval)
        this.physics.setTimeStep(1/60)
        tf.engine().endScope()
    }

    updateWeights () {
        const actorTargetWeights = this.actorTarget.getWeights()
        const actorWeights = this.actorMain.getWeights().map((w, i) => (
            w.mul(this.config.tau).add(actorTargetWeights[i].mul(1-this.config.tau))
        ))
        this.actorTarget.loadWeights(actorWeights)

        const criticTargetWeights = this.criticTarget.getWeights()
        const criticWeights = this.criticMain.getWeights().map((w, i) => (
            w.mul(this.config.tau).add(criticTargetWeights[i].mul(1-this.config.tau))
        ))
        this.criticTarget.loadWeights(criticWeights)
    }

    private _log: string = ""
    log (message: any) {
        this._log += message + "\n"
    }

    flush() {
        console.log(this._log)
        this._log = ""
    }

    resetEpisode (failed: boolean = true) {
        if(failed && this.shouldTrain && this.currentState !== null && this.currentAction !== null) {
            const punishment = -10
            this.log(`FAILURE - ADDED TO MEMORY (${this.memory.size}): ` + [this.currentAction, punishment])
            // const state = collectState(this.drone, this.wind)
            // this.memory.add(state, null, this.currentAction, punishment, true)
            // this.rewardCounts++
            // this.avgReward = (this.avgReward * (this.rewardCounts - 1) + punishment) / this.rewardCounts
            this.flush()
        }

        this.currentState = null
        this.currentAction = null
        this.currentEpisodeDuration = 0

        const randomLimit = this.config.boundDiameter / 2
        const scale = (Math.random() / 2 + 0.5 * (Math.random() > 0.5 ? 1 : -1)) * randomLimit
        this.drone.reset(new Vector3(
            Math.random(),
            Math.random(),
            Math.random()).scale(scale))
    }
}