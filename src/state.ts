import DroneEntity from "./drone";
import Wind from "./wind";

/**
 * [x, y, z, windDirection]
 */
export type StateArray = [number, number, number, number]

export function collectState(drone: DroneEntity, wind: Wind): StateArray {
    const state = []
    drone.physics.transformNode.absolutePosition.toArray(state)
    state.push(wind.windDirection)

    return state
}