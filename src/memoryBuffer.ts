import {StateArray} from "./state";

export type Memory = [StateArray, StateArray, number, number]

export class MemoryBuffer {
    private memory: Memory[]
    private currentIndex: number
    private readonly maxSize: number
    private currentSize: number
    constructor(maxSize: number) {
        this.memory = new Array(maxSize)
        this.currentIndex = 0
        this.currentSize = 0
        this.maxSize = maxSize
    }

    add(state: StateArray, nextState: StateArray, action: number, reward: number) {
        this.memory[this.currentIndex] = [state, nextState, action, reward]

        this.currentIndex++
        this.currentSize = Math.min(this.currentSize + 1, this.maxSize)
        if (this.currentIndex >= this.maxSize) {
            this.currentIndex = 0
        }
    }

    // https://stackoverflow.com/a/11935263
    getRandomSubarray(arr, size) {
        var shuffled = arr.slice(0), i = arr.length, temp, index;
        while (i--) {
            index = Math.floor((i + 1) * Math.random());
            temp = shuffled[index];
            shuffled[index] = shuffled[i];
            shuffled[i] = temp;
        }
        return shuffled.slice(0, size);
    }

    sample(count: number): Memory[] {
        return this.getRandomSubarray(this.memory.slice(0, this.currentSize), count)
    }

    get size() {
        return this.currentSize
    }
}