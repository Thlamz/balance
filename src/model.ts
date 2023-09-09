import * as tf from "@tensorflow/tfjs";
import {Sequential} from "@tensorflow/tfjs";
import {STATE_SIZE} from "./state";
import {ACTION_MAP} from "./action";

type QValues = tf.Tensor

export class Model {
    public network: Sequential
    constructor() {
        const network = tf.sequential();
        [60, 60].forEach((hiddenLayerSize, i) => {
            network.add(tf.layers.dense({
                units: hiddenLayerSize,
                activation: 'relu',
                // `inputShape` is required only for the first layer.
                inputShape: i === 0 ? [STATE_SIZE] : undefined
            }));
        });
        network.add(tf.layers.dense({units: ACTION_MAP.length}));

        network.summary();
        network.compile({optimizer: 'adam', loss: 'meanSquaredError'});
        this.network = network
    }

    public predict(states: tf.Tensor): QValues {
        return <QValues> tf.tidy(() => this.network.predict(states.reshape([-1, STATE_SIZE])))
    }

    public async optimize(xBatch: QValues, yBatch: QValues) {
        return await this.network.fit(xBatch, yBatch)
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