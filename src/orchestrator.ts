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

    criticMain1: Critic
    criticTarget1: Critic

    criticMain2: Critic
    criticTarget2: Critic

    currentEpisodeDuration: number

    trainingStep: number

    avgReward: number = 0
    rewardCounts: number = 0;

    actorLosses: number[] = []
    critic1Losses: number[] = []
    critic2Losses: number[] = []
    avgRewards: number[] = []

    constructor(scene: Scene, drone: DroneEntity, wind: Wind, config: Configuration, train = true) {
        this.scene = scene
        this.drone = drone
        this.wind = wind
        this.config = config

        this.memory = new MemoryBuffer(config['memorySize'])

        this.actorMain = new Actor(this.config.numHiddenLayers, this.config.hiddenLayerSize, this.config.actorLR)
        this.actorTarget = new Actor(this.config.numHiddenLayers, this.config.hiddenLayerSize, this.config.actorLR)
        this.actorTarget.loadWeights(this.actorMain.getWeights())

        this.criticMain1 = new Critic(this.config.numHiddenLayers, this.config.hiddenLayerSize, this.config.criticLR)
        this.criticTarget1 = new Critic(this.config.numHiddenLayers, this.config.hiddenLayerSize, this.config.criticLR)
        this.criticTarget1.loadWeights(this.criticMain1.getWeights())

        this.criticMain2 = new Critic(this.config.numHiddenLayers, this.config.hiddenLayerSize, this.config.criticLR)
        this.criticTarget2 = new Critic(this.config.numHiddenLayers, this.config.hiddenLayerSize, this.config.criticLR)
        this.criticTarget2.loadWeights(this.criticMain2.getWeights())

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
        const x = this.critic1Losses.map((_v, i) => i)
        const maxCritic1 = Math.max(...this.critic1Losses)
        const trace1: Plotly.Data = {
            x,
            y: this.critic1Losses.map(l => l / maxCritic1),
            type: 'scatter',
            name: "Critic 1 Loss"
        };

        const maxCritic2 = Math.max(...this.critic2Losses)
        const trace2: Plotly.Data = {
            x,
            y: this.critic2Losses.map(l => l / maxCritic2),
            type: 'scatter',
            name: "Critic 2 Loss"
        };

        const trace3: Plotly.Data = {
            x,
            y: this.actorLosses,
            type: 'scatter',
            name: "Actor Loss"
        };
        const trace4: Plotly.Data = {
            x,
            y: this.avgRewards,
            type: 'scatter',
            name: "Avg Rewards"
        };


        const data = [trace1, trace2, trace3, trace4];
        Plotly.newPlot('plot', data);
    }

    set shouldTrain(value: boolean) {
        if(value) {
            this.epsilon = 1
        } else {
            this.epsilon = 0

            // If it was training and is not anymore, saves the model
            if(this.shouldTrain) {
                // this.actorMain.save().then(() => console.log("ACTOR EXPORTED"));
                // this.criticMain1.save().then(() => console.log("CRITIC EXPORTED"));
                // this.criticMain2.save().then(() => console.log("CRITIC EXPORTED"));

                this.plot()
            }
        }
        this.trainingStep = 0
        this.currentEpisodeDuration = 0
        this.memory.clear()
        this._optimize = value
    }

    async loadModel(actor: string, critic: string) {
        // const isTraining = this.shouldTrain
        // this.shouldTrain = false
        // await this.actorMain.load(actor)
        // await this.criticMain.load(critic)
        // this.shouldTrain = isTraining
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
        return -drone.physics.transformNode.absolutePosition.length() / (this.config.boundDiameter/2)
    }

    choose(state: StateArray): number[] {
        if (Math.random() > this.epsilon || !this.shouldTrain) {
            this.log(`CHOICE (e=${this.epsilon.toFixed(3)}) - PREDICTED`)
            const prediction: tf.Tensor = tf.tidy(() => {
                return this.actorMain.predict(tf.tensor(state)).flatten()
            })
            return <number[]> prediction.arraySync()
        } else {
            this.log(`CHOICE (e=${this.epsilon.toFixed(3)}) - RNG`)
            return [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1]
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


            const targetValues = tf.tidy(() => {
                const targetActionsNoNoise = this.actorTarget.predict(nextStateBatch)
                const noise = tf
                    .randomNormal(targetActionsNoNoise.shape, 0, 0.2)
                    .clipByValue(-0.5, 0.5)
                const targetActions = targetActionsNoNoise.add(noise).clipByValue(0, 1)

                const targetNextStateValues1 = this.criticTarget1.predict(nextStateBatch, targetActions)
                const targetNextStateValues2 = this.criticTarget2.predict(nextStateBatch, targetActions)
                const targetNextStateValues = tf.minimum(targetNextStateValues1, targetNextStateValues2)

                const discountedNextStateValues = targetNextStateValues.mul(this.config.gamma)
                const terminalNextStateValues = discountedNextStateValues.mul(terminalBatch)
                return terminalNextStateValues.add(rewardsBatch)
            })

            const criticInfo1 = await this.criticMain1.optimize(stateBatch, actionBatch, targetValues);
            const criticInfo2 = await this.criticMain2.optimize(stateBatch, actionBatch, targetValues);

            let actorInfo: number
            if (this.trainingStep % this.config.actorUpdateInterval === 0) {
                actorInfo = await this.actorMain.optimize(stateBatch, this.criticMain1)
                this.updateWeights()
            } else {
                actorInfo = this.actorLosses[this.actorLosses.length - 1]
            }


            stateBatch.dispose()
            nextStateBatch.dispose()
            actionBatch.dispose()
            rewardsBatch.dispose()
            terminalBatch.dispose()
            targetValues.dispose()
            this.log(`CRITIC1 LOSS = ${criticInfo1}`)
            this.log(`CRITIC2 LOSS = ${criticInfo2}`)
            this.log(`ACTOR LOSS = ${actorInfo}`)
            this.avgRewards.push(this.avgReward)
            this.actorLosses.push(actorInfo)
            this.critic1Losses.push(criticInfo1)
            this.critic2Losses.push(criticInfo2)
        }
    }

    async loop () {
        this.log(`------------- STEP ${this.trainingStep} ---------------`)
        const nextState = collectState(this.drone, this.wind)
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
    }

    updateWeights () {
        const actorTargetWeights = this.actorTarget.getWeights()
        const actorWeights = this.actorMain.getWeights().map((w, i) => (
            tf.tidy(() => w.mul(this.config.tau).add(actorTargetWeights[i].mul(1-this.config.tau)))
        ))
        this.actorTarget.loadWeights(actorWeights)

        const criticTargetWeights1 = this.criticTarget1.getWeights()
        const criticWeights1 = this.criticMain1.getWeights().map((w, i) => (
            tf.tidy(() => w.mul(this.config.tau).add(criticTargetWeights1[i].mul(1-this.config.tau)))
        ))
        this.criticTarget1.loadWeights(criticWeights1)

        const criticTargetWeights2 = this.criticTarget2.getWeights()
        const criticWeights2 = this.criticMain2.getWeights().map((w, i) => (
            tf.tidy(() => w.mul(this.config.tau).add(criticTargetWeights2[i].mul(1-this.config.tau)))
        ))
        this.criticTarget2.loadWeights(criticWeights2)
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
        // if(failed && this.shouldTrain && this.currentState !== null && this.currentAction !== null) {
        //     const punishment = -10
        //     this.log(`FAILURE - ADDED TO MEMORY (${this.memory.size}): ` + [this.currentAction, punishment])
        //     const state = collectState(this.drone, this.wind)
        //     this.memory.add(state, null, this.currentAction, punishment, true)
        //     this.rewardCounts++
        //     this.avgReward = (this.avgReward * (this.rewardCounts - 1) + punishment) / this.rewardCounts
        //     this.flush()
        // }

        this.currentState = null
        this.currentAction = null
        this.currentEpisodeDuration = 0

        // const randomLimit = this.config.boundDiameter * 0.8
        // const scale = (Math.random() - 0.5) * 2 * randomLimit
        // this.drone.reset(new Vector3(
        //     Math.random(),
        //     Math.random(),
        //     Math.random()).scale(scale))
        this.drone.reset(new Vector3(0,0,0))
    }
}