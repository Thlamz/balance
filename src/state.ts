import DroneEntity from "./drone";
import Wind from "./wind";

/**
 * Current state of the simulation
 * [x, y, z, rx, ry, rz, vx, vy, vz, vrx, vry, vrz windDirection]
 */
export type StateArray = number[]

export const STATE_SIZE = 8

export function collectState(drone: DroneEntity, boundSize: number, _wind: Wind): StateArray {
    const state: StateArray = []
    drone.physics.transformNode.absolutePosition.normalizeToNew().toArray(state)
    state.push(drone.physics.transformNode.absolutePosition.length() / boundSize)
    // drone.physics.transformNode.rotation.toArray(state, state.length)
    drone.physics.body.getLinearVelocity().normalizeToNew().toArray(state, state.length)
    state.push(drone.physics.body.getLinearVelocity().length())
    // drone.physics.body.getAngularVelocity().toArray(state, state.length)
    // state.push(wind.windDirection)

    return state
}