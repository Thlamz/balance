import {StateArray} from "./state";

export type Memory = [StateArray, StateArray, [number, number, number, number], number, boolean]

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

    add(state: StateArray,
        nextState: StateArray | null,
        action: [number, number, number, number],
        reward: number,
        terminal: boolean = false) {
        this.memory[this.currentIndex] = [state, nextState || state, action, reward, terminal]

        this.currentIndex++
        this.currentSize = Math.min(this.currentSize + 1, this.maxSize)
        if (this.currentIndex >= this.maxSize) {
            this.currentIndex = 0
        }
    }

    clear() {
        this.currentIndex = 0
        this.currentSize = 0
        this.memory = new Array(this.maxSize)
    }

    // https://stackoverflow.com/a/11935263
    getRandomSubarray(arr: Memory[], size: number) {
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