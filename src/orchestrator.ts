import {collectState, StateArray} from "./state";
import DroneEntity from "./drone";
import Wind from "./wind";
import * as tf from "@tensorflow/tfjs"
import {Memory, MemoryBuffer} from "./memoryBuffer";
import {Model} from "./model";
import {ACTION_MAP, applyAction} from "./action";
import {Scene} from "@babylonjs/core/scene";
import {Vector3} from "@babylonjs/core/Maths/math.vector";

interface Configuration {
    stepInterval: number,
    trainingSteps: number
    memorySize: number
    batchSize: number,
    targetUpdateInterval: number
    gamma: number
    hiddenLayerSize: number
    numHiddenLayers: number,
    boundSize: number
}



export class Orchestrator {
    scene: Scene
    drone: DroneEntity
    wind: Wind
    currentState: StateArray | null
    currentAction: number | null

    config: Configuration

    interval: number | undefined

    epsilon: number

    memory: MemoryBuffer

    policy: Model
    target: Model

    trainingStep: number
    constructor(scene: Scene, drone: DroneEntity, wind: Wind, config: Configuration, train = true) {
        this.scene = scene
        this.drone = drone
        this.wind = wind
        this.config = config

        this.memory = new MemoryBuffer(config['memorySize'])

        this.policy = new Model()

        this.target = new Model()

        this.trainingStep = 0
        this.epsilon = 0

        this.shouldTrain = train

        this.currentState = null
        this.currentAction = null

        scene.onBeforePhysicsObservable.add(async () => {
            if(drone.mesh.absolutePosition.lengthSquared() > (config.boundSize/2) * (config.boundSize/2)) {
                this.failEpisode()
            }
        })
    }

    _optimize: boolean = false
    get shouldTrain() {
        return this._optimize
    }

    set shouldTrain(value: boolean) {
        if(value) {
            this.epsilon = 1
        } else {
            this.epsilon = 0
            this.policy.save().then(() => console.log("MODEL EXPORTED"));
        }
        this.trainingStep = 0
        this.memory.clear()
        this._optimize = value
    }

    async loadModel(path: string) {
        const isTraining = this.shouldTrain
        this.shouldTrain = false
        await this.policy.load(path)
        await this.target.load(path)
        this.shouldTrain = isTraining
    }

    start() {
        this.interval = window.setTimeout(() => this.loop(), this.config.stepInterval)
    }

    stop() {
        clearInterval(this.interval)
    }

    computeReward(drone: DroneEntity): number {
        return -drone.physics.transformNode.absolutePosition.lengthSquared()
    }

    choose(state: StateArray): number {
        if (Math.random() > this.epsilon || !this.shouldTrain) {
            this.log(`CHOICE (e=${this.epsilon.toFixed(3)}) - PREDICTED`)
            const prediction: tf.Tensor = tf.tidy(() => {
                const prediction = this.policy.predict(tf.tensor(state)).flatten()
                return prediction.argMax()
            })
            const action = prediction.dataSync()[0]
            prediction.dispose()
            return action
        } else {
            this.log(`CHOICE (e=${this.epsilon.toFixed(3)}) - RNG`)
            return Math.floor(Math.random() * ACTION_MAP.length)
        }
    }

    private async optimize (nextState: StateArray) {
        this.epsilon = Math.exp(-1. * this.trainingStep / 2000)

        if(!this.currentState || !this.currentAction || this.trainingStep >= this.config.trainingSteps) {
            return
        }

        const reward = this.computeReward(this.drone)
        this.memory.add(this.currentState, nextState, this.currentAction, reward)
        this.log(`ADDED TO MEMORY (${this.memory.size}): ` + [this.currentAction, reward])
        if (this.memory.size > this.config.batchSize) {
            this.log("OPTIMIZING")
            const samples: Memory[] = this.memory.sample(this.config.batchSize)

            const stateBatch = tf.tensor(samples.map((memory) => memory[0]))
            const guessedQs = this.policy.predict(stateBatch)

            const expectedQs: tf.Tensor = tf.tidy(() => {
                const nextStateBatch = tf.tensor(samples.map((memory) => memory[1]))
                let nextQs = this.target.predict(nextStateBatch)
                const bestIndexes = nextQs.argMax(1)
                const rewards = tf.tensor(samples.map(memory => memory[3]))
                const bestNextQs = nextQs.gather(bestIndexes, 1, 1)
                const rewardedNextQs = bestNextQs.add(rewards)
                return rewardedNextQs.mul(this.config.gamma)
            })
            const guessedQArray = <number[][]> guessedQs.arraySync()
            const expectedArray = expectedQs.flatten().arraySync()
            for(let index = 0; index < this.config.batchSize; index++) {
                guessedQArray[index][samples[index][2]] = expectedArray[index]
            }

            const info = await this.policy.optimize(stateBatch, tf.tensor(guessedQArray));
            stateBatch.dispose()
            guessedQs.dispose()
            expectedQs.dispose()
            this.log(`LOSS = ${info.history.loss[0]}`)

            if (this.trainingStep % this.config.targetUpdateInterval == 0) {
                this.target.loadWeights(this.policy.getWeights())
                this.log("UPDATING TARGET")
            }
        }
    }

    async loop () {
        this.log(`------------- STEP ${this.trainingStep} ---------------`)
        const nextState = collectState(this.drone, this.wind)
        const action = this.choose(nextState)
        this.log(ACTION_MAP[action])
        applyAction(ACTION_MAP[action], this.drone)

        if (this.shouldTrain) {
            await this.optimize(nextState)
        }


        this.currentState = nextState
        this.currentAction = action

        this.trainingStep++

        if(this.trainingStep === this.config.trainingSteps) {
            this.shouldTrain = false
        }

        this.flush()
        this.interval = window.setTimeout(() => this.loop(), this.config.stepInterval)
    }

    private _log: string = ""
    log (message: any) {
        this._log += message + "\n"
    }

    flush() {
        console.log(this._log)
        this._log = ""
    }

    failEpisode () {
        this.currentState = null

        const randomLimit = this.config.boundSize * 0.4
        this.drone.reset(new Vector3(
            Math.random(),
            Math.random(),
            Math.random()).scale(Math.random() * randomLimit))
    }
}