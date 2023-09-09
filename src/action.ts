import DroneEntity from "./drone";

/**
 * [prop1Speed, prop2Speed, prop3Speed, prop4Speed]
 */
export type ActionArray = [number, number, number, number]

export const ACTION_MAP = [
    [0,0,0,0],
    [1,0,0,0],
    [0,1,0,0],
    [0,0,1,0],
    [0,0,0,1],
    [1,1,0,0],
    [1,0,1,0],
    [1,0,0,1],
    [0,1,0,1],
    [0,0,1,1],
    [0,1,1,0],
    [1,1,1,0],
    [1,1,0,1],
    [1,0,1,1],
    [0,1,1,1],
    [1,1,1,1]
]

export function applyAction(action: ActionArray, drone: DroneEntity) {
    action.forEach((speed, index) => drone.setPropSpeed(speed, index))
}