import DroneEntity from "./drone";
import Wind from "./wind";

/**
 * Current state of the simulation
 * [x, y, z, rx, ry, rz, vx, vy, vz, vrx, vry, vrz windDirection]
 */
export type StateArray = [number, number, number, number, number, number, number,
    number, number, number, number, number, number]

export const STATE_SIZE = 13

export function collectState(drone: DroneEntity, wind: Wind): StateArray {
    const state = []
    drone.physics.transformNode.absolutePosition.toArray(state)
    drone.physics.transformNode.rotation.toArray(state, state.length)
    drone.physics.body.getLinearVelocity().toArray(state, state.length)
    drone.physics.body.getAngularVelocity().toArray(state, state.length)
    state.push(wind.windDirection)

    return state
}