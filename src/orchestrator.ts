import {collectState, StateArray} from "./state";
import DroneEntity from "./drone";
import Wind from "./wind";
import * as tf from "@tensorflow/tfjs"
import {Memory, MemoryBuffer} from "./memoryBuffer";
import {Model} from "./model";
import {applyAction} from "./action";

interface Configuration {
    stepInterval: number,
    optimize: boolean
    training_steps: number
    memory_size: number
    batch_size: number,
    target_update_interval: number
}


const actionMap = [
    [0,0,0,0],
    [1,0,0,0],
    [0,1,0,0],
    [0,0,1,0],
    [0,0,0,1],
    [1,1,0,0],
    [1,0,1,0],
    [1,0,0,1],
    [0,1,0,1],
    [0,0,1,1],
    [0,1,1,0],
    [1,1,1,0],
    [1,1,0,1],
    [1,0,1,1],
    [0,1,1,1],
    [1,1,1,1]
]



export class Orchestrator {
    drone: DroneEntity
    wind: Wind
    currentState: StateArray | null
    currentAction: number

    config: Configuration

    interval: number

    epsilon: number

    memory: MemoryBuffer

    policy: Model
    target: Model

    trainingStep: number
    constructor(drone: DroneEntity, wind: Wind, config: Configuration) {
        this.drone = drone
        this.wind = wind
        this.config = config

        this.memory = new MemoryBuffer(config['memory_size'])

        this.policy = new Model()
        this.target = new Model()

        this.trainingStep = 0
        this.epsilon = 1

        this.resetEpisode()
    }

    start() {
        this.interval = setTimeout(() => this.loop(), this.config.stepInterval)
    }

    stop() {
        clearInterval(this.interval)
    }

    computeReward(drone: DroneEntity): number {
        return -drone.physics.transformNode.absolutePosition.lengthSquared()
    }

    choose(state: StateArray): number {
        if (Math.random() > this.epsilon) {
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
            return Math.floor(Math.random() * actionMap.length)
        }
    }

    async loop () {
        this.log(`------------- STEP ${this.trainingStep} ---------------`)
        const nextState = collectState(this.drone, this.wind)
        const reward = this.computeReward(this.drone)
        if(this.currentState && this.trainingStep < this.config.training_steps) {
            this.memory.add(this.currentState, nextState, this.currentAction, reward)
            this.log(`ADDED TO MEMORY (${this.memory.size}): ` + [this.currentAction, reward])
            if (this.memory.size > this.config.batch_size) {
                const samples: Memory[] = this.memory.sample(this.config.batch_size)

                const stateBatch = tf.tensor(samples.map((memory) => memory[0]))
                const guessedQs = this.policy.predict(stateBatch)

                const expectedQs: tf.Tensor = tf.tidy(() => {
                    const nextStateBatch = tf.tensor(samples.map((memory) => memory[1]))
                    let nextQs = this.target.predict(nextStateBatch)
                    const bestIndexes = nextQs.argMax(1)
                    const rewards = tf.tensor(samples.map(memory => memory[3]))
                    const bestNextQs = nextQs.gather(bestIndexes, 1, 1)
                    const rewardedNextQs = bestNextQs.add(rewards)
                    return rewardedNextQs.mul(0.99)
                })
                this.log("OPTIMIZING")
                const guessedQArray = guessedQs.arraySync()
                const expectedArray = expectedQs.flatten().arraySync()
                for(let index = 0; index < this.config.batch_size; index++) {
                    guessedQArray[index][samples[index][2]] = expectedArray[index]
                }

                const info = await this.policy.optimize(stateBatch, tf.tensor(guessedQArray));
                stateBatch.dispose()
                guessedQs.dispose()
                expectedQs.dispose()
                this.log(`LOSS = ${info.history.loss[0]}`)

                if (this.trainingStep % this.config.target_update_interval == 0) {
                    this.target.loadWeights(this.policy.getWeights())
                    this.log("UPDATING TARGET")
                }
            }
        }
        this.currentState = nextState
        const action = this.choose(this.currentState)
        this.log(actionMap[action])
        applyAction(actionMap[action], this.drone)
        this.currentAction = action
        this.epsilon -= 1/this.config.training_steps
        this.trainingStep++

        this.interval = setTimeout(() => this.loop(), this.config.stepInterval)
        this.flush()
    }

    private _log: string
    log (message: any) {
        this._log += message + "\n"
    }

    flush() {
        console.log(this._log)
        this._log = ""
    }


    resetEpisode () {
        this.currentState = null
    }
}