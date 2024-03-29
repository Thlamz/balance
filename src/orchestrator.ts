import {collectState, StateArray} from "./state";
import DroneEntity from "./drone";
import * as tf from "@tensorflow/tfjs"
import {Memory, MemoryBuffer} from "./memoryBuffer";
import {ACTION_SIZE, applyAction} from "./action";
import {Scene} from "@babylonjs/core/scene";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {Actor} from "./actor.ts";
import {Critic} from "./critic.ts";
import {HavokPlugin} from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";

export interface Configuration {
    stepInterval: number,
    trainingSteps: number
    memorySize: number
    batchSize: number,
    actorUpdateInterval: number
    gamma: number
    hiddenLayerSize: number
    numHiddenLayers: number
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
    currentState: StateArray | null
    currentAction: number[] | null

    config: Configuration

    boundDiameter: number

    interval: number | undefined

    epsilon: number = 0

    trainingInfoUI: HTMLPreElement

    memory: MemoryBuffer

    actorMain!: Actor;
    actorTarget!: Actor;
    criticMain!: Critic
    criticTarget!: Critic

    currentEpisodeDuration: number

    trainingStep: number = 0

    avgReward: number = 0
    rewardCounts: number = 0;

    actorLosses: number[] = []
    criticLosses: number[] = []
    avgRewards: number[] = []

    constructor(scene: Scene,
                drone: DroneEntity,
                physics: HavokPlugin,
                config: Configuration,
                boundDiameter: number,
                train = true) {
        this.scene = scene
        this.physics = physics
        this.drone = drone
        this.config = config
        this.boundDiameter = boundDiameter

        this.memory = new MemoryBuffer(config['memorySize'])

        this.shouldTrain = train

        this.currentState = null
        this.currentAction = null

        this.currentEpisodeDuration = 0

        scene.onBeforePhysicsObservable.add(async () => {
            if(drone.mesh.absolutePosition.lengthSquared() > (boundDiameter/2) * (boundDiameter/2)) {
                this.resetEpisode()
            }
        })

        window.addEventListener("keypress", (event) => {
            if(event.key == "r") {
                this.resetEpisode()
            }
        })

        document.getElementById("reset")!.addEventListener("click", () => {
            this.resetEpisode()
        })

        this.trainingInfoUI = <HTMLPreElement> document.getElementById("training-info")
    }

    resetTraining() {
        this.actorMain?.dispose()
        this.actorTarget?.dispose()
        this.criticMain?.dispose()
        this.criticTarget?.dispose()

        this.actorMain = new Actor(this.config.numHiddenLayers, this.config.hiddenLayerSize, this.config.actorLR)
        this.actorTarget = new Actor(this.config.numHiddenLayers, this.config.hiddenLayerSize, this.config.actorLR)
        this.actorTarget.loadWeights(this.actorMain.getWeights())

        this.criticMain = new Critic(this.config.numHiddenLayers, this.config.hiddenLayerSize, this.config.criticLR)
        this.criticTarget = new Critic(this.config.numHiddenLayers, this.config.hiddenLayerSize, this.config.criticLR)
        this.criticTarget.loadWeights(this.criticMain.getWeights())

        this.epsilon = 1
        this.avgRewards = []
        this.actorLosses = []
        this.criticLosses = []
        this.avgReward = 0

        this.trainingStep = 0
        this.currentEpisodeDuration = 0
        this.memory.clear()

        this.resetEpisode()
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
            name: "Critic Loss",
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

        const layout: Partial<Plotly.Layout> = {
            paper_bgcolor:"transparent",
            plot_bgcolor: "transparent",
            yaxis: {
                gridcolor: "rgba(0,0,0,0.1)"
            },
            xaxis: {
                gridcolor: "rgba(0,0,0,0.1)"
            },
            legend: {
                orientation: "h",
                xanchor: "center"
            },
            margin: {
                pad: 4,
                t: 10,
                b: 10
            }
        }

        const config: Partial<Plotly.Config> = {
            responsive: true
        }

        const data = [trace1, trace2, trace3];
        // @ts-ignore
        Plotly.newPlot('plot', data, layout, config);
    }

    updateTrainingInfo() {
        let trainingInfoText: string = ""

        trainingInfoText += `Is training? ${this.shouldTrain}\n`

        if (this.shouldTrain) {
            trainingInfoText += `Training step: ${this.trainingStep}\n`
            trainingInfoText += `Epsilon: ${this.epsilon.toFixed(3)}\n`
            trainingInfoText += `Memory size: ${this.memory.size}\n`
            trainingInfoText += `Avg reward: ${this.avgReward.toFixed(3)}\n`

            trainingInfoText += `Actor loss: ${this.actorLosses[this.actorLosses.length - 1]?.toFixed(3)}\n`
            trainingInfoText += `Critic loss: ${this.criticLosses[this.criticLosses.length - 1]?.toFixed(3)}\n`
        }

        trainingInfoText += `Episode duration: ${this.currentEpisodeDuration}\n`

        this.trainingInfoUI.innerText = trainingInfoText
    }

    saveModel() {
        this.actorMain.save().then(() => console.log("ACTOR EXPORTED"));
        this.criticMain.save().then(() => console.log("CRITIC EXPORTED"));
    }

    set shouldTrain(value: boolean) {
        this._optimize = value
        if (value) {
            this.resetTraining()
        }
    }

    async loadModel(actor: string) {
        const isTraining = this.shouldTrain
        this.shouldTrain = false
        await this.actorMain.load(actor)
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
        const oldVelocityVector =
            new Vector3(this.currentState![4], this.currentState![5], this.currentState![6]).scale(this.currentState![7])

        if (centerVector.length() <= 0.4 && newVelocityVector.length() <= 0.3) {
            return 2
        }

        const newDotProduct = Vector3.Dot(centerVector, newVelocityVector)
        const oldDotProduct = Vector3.Dot(centerVector, oldVelocityVector)

        return -(newDotProduct - oldDotProduct)
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
        this.avgRewards.push(this.avgReward)
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
            this.actorLosses.push(actorInfo)
            this.criticLosses.push(criticInfo)

            this.updateWeights()
        }
    }

    async loop () {
        tf.engine().startScope()
        this.physics.setTimeStep(0)
        this.log(`------------- STEP ${this.trainingStep} ---------------`)
        const nextState = collectState(this.drone, this.boundDiameter/2)
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
            this.resetEpisode()
        }

        if(this.trainingStep === this.config.trainingSteps) {
            this.shouldTrain = false
            this.saveModel()
        }

        if (this.shouldTrain) {
            this.plot()
        }

        this.updateTrainingInfo()

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

    resetEpisode () {
        this.currentState = null
        this.currentAction = null
        this.currentEpisodeDuration = 0

        const randomLimit = this.boundDiameter / 2
        const scale = (Math.random() / 2 + 0.5 * (Math.random() > 0.5 ? 1 : -1)) * randomLimit
        this.drone.reset(new Vector3(
            Math.random(),
            Math.random(),
            Math.random()).normalize().scale(scale))
    }
}