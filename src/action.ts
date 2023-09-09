import DroneEntity from "./drone";

/**
 * [prop1Speed, prop2Speed, prop3Speed, prop4Speed]
 */
export type ActionArray = [number, number, number, number]

export function applyAction(action: ActionArray, drone: DroneEntity) {
    action.forEach((speed, index) => drone.setPropSpeed(speed, index))
}