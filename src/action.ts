import DroneEntity from "./drone";

/**
 * [prop1Speed, prop2Speed, prop3Speed, prop4Speed]
 */
export type ActionArray = number[]

export const ACTION_SIZE = 4
export const ACTION_MAP: ActionArray[] = [
    [0.885,0.885,0.885,0.885],
    [0.94,0.885,0.885,0.885],
    [0.885,0.94,0.885,0.885],
    [0.885,0.885,0.94,0.885],
    [0.885,0.885,0.885,0.94],
    [0.94,0.94,0.885,0.885],
    [0.94,0.885,0.94,0.885],
    [0.94,0.885,0.885,0.94],
    [0.885,0.94,0.885,0.94],
    [0.885,0.885,0.94,0.94],
    [0.885,0.94,0.94,0.885],
    [0.94,0.94,0.94,0.885],
    [0.94,0.94,0.885,0.94],
    [0.94,0.885,0.94,0.94],
    [0.885,0.94,0.94,0.94],
    [0.94,0.94,0.94,0.94]
]

export function applyAction(action: ActionArray, drone: DroneEntity) {
    drone.setAction(action)
    drone.applyForces()
}