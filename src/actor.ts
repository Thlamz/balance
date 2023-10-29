import * as tf from "@tensorflow/tfjs";
import {Sequential} from "@tensorflow/tfjs";
import {STATE_SIZE} from "./state";
import {Critic} from "./critic.ts";

export class Actor {
    public network: Sequential
    public optimizer: tf.Optimizer
    constructor(numHiddenLayers: number, hiddenLayerSize: number) {
        const network = tf.sequential();
        new Array(numHiddenLayers).fill(hiddenLayerSize).forEach((hiddenLayerSize, i) => {
            network.add(tf.layers.dense({
                units: hiddenLayerSize,
                activation: 'relu',
                // `inputShape` is required only for the first layer.
                inputShape: i === 0 ? [STATE_SIZE] : undefined
            }));
        });
        network.add(tf.layers.dense({units: 4, activation: 'sigmoid'}));

        network.summary();
        network.compile({optimizer: 'adam', loss: 'meanSquaredError'});
        this.network = network
        this.optimizer = tf.train.adam()
    }

    public predict(states: tf.Tensor): tf.Tensor {
        return <tf.Tensor> tf.tidy(() => this.network.predict(states.reshape([-1, STATE_SIZE])))
    }

    public async optimize(state: tf.Tensor, critic: Critic): Promise<number> {
        const lossFunction = () => (
            tf.tidy(() => {
                const newPolicyActions = this.predict(state)
                const newPolicyLoss = critic.predict(state, newPolicyActions)
                return tf.mean(newPolicyLoss.mul(-1)).asScalar()
            })
        )
        const trainableVars = this.network.getWeights(true) as tf.Variable<tf.Rank>[];
        const grads = tf.variableGrads(lossFunction, trainableVars)
        this.optimizer.applyGradients(grads.grads)
        const loss = (await grads.value.data())[0]
        tf.dispose(grads)
        return loss
    }

    public loadWeights(weights: tf.Tensor[]) {
        this.network.setWeights(weights)
    }

    public getWeights(): tf.Tensor[] {
        return this.network.getWeights()
    }

    public async save() {
        await this.network.save('downloads://trained-model');
    }

    public async load(path: string) {
        this.network = <Sequential> await tf.loadLayersModel(path)
    }
}