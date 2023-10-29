import * as tf from "@tensorflow/tfjs";
import {Sequential} from "@tensorflow/tfjs";
import {STATE_SIZE} from "./state";

export class Critic {
    public network: Sequential
    constructor(numHiddenLayers: number, hiddenLayerSize: number) {
        const network = tf.sequential();
        new Array(numHiddenLayers).fill(hiddenLayerSize).forEach((hiddenLayerSize, i) => {
            network.add(tf.layers.dense({
                units: hiddenLayerSize,
                activation: 'relu',
                // `inputShape` is required only for the first layer.
                inputShape: i === 0 ? [STATE_SIZE + 4] : undefined
            }));
        });
        network.add(tf.layers.dense({units: 1}));

        network.summary();
        network.compile({optimizer: 'adam', loss: 'meanSquaredError'});
        this.network = network
    }

    public predict(states: tf.Tensor, actions: tf.Tensor): tf.Tensor {
        return <tf.Tensor> tf.tidy(() => {
            const input = tf.concat([states, actions], 1)
            return this.network.predict(input.reshape([-1, STATE_SIZE + 4]))
        })
    }

    public async optimize(states: tf.Tensor, actions: tf.Tensor, yBatch: tf.Tensor): Promise<number> {
        const xBatch = tf.tidy(() => tf.concat([states, actions], 1))
        return <number>(await this.network.fit(xBatch, yBatch)).history.loss[0]
    }

    public loadWeights(weights: tf.Tensor[]) {
        this.network.setWeights(weights)
    }

    public getWeights(): tf.Tensor[] {
        return this.network.getWeights()
    }

    public async save() {
        await this.network.save('downloads://trained-critic-model');
    }

    public async load(path: string) {
        this.network = <Sequential> await tf.loadLayersModel(path)
    }
}