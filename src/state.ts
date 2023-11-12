import DroneEntity from "./drone";

/**
 * Current state of the simulation
 * [x, y, z, rx, ry, rz, vx, vy, vz, vrx, vry, vrz windDirection]
 */
export type StateArray = number[]

export const STATE_SIZE = 8

export function collectState(drone: DroneEntity, boundSize: number): StateArray {
    const state: StateArray = []
    drone.physics.transformNode.absolutePosition.normalizeToNew().toArray(state)
    state.push(drone.physics.transformNode.absolutePosition.length() / boundSize)
    drone.physics.body.getLinearVelocity().normalizeToNew().toArray(state, state.length)
    state.push(drone.physics.body.getLinearVelocity().length())
    return state
}