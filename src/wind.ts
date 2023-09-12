import {Scene} from "@babylonjs/core/scene";
import {CreateTorus} from "@babylonjs/core/Meshes/Builders/torusBuilder";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {CreateCylinder} from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {PhysicsAggregate} from "@babylonjs/core/Physics/v2/physicsAggregate";

export default class Wind {
    private readonly scene: Scene

    public windDirection: number

    public readonly vane: Mesh
    public readonly bounds: Mesh

    public speed: number

    constructor(scene: Scene, affectedEntities: PhysicsAggregate[]) {
        this.scene = scene

        const boundMaterial = new StandardMaterial("boundMaterial", scene);
        boundMaterial.disableLighting = true
        boundMaterial.emissiveColor = new Color3(0.95, 0.95, 0.95);
        boundMaterial.alpha = 0.6

        const bounds = CreateTorus("windBound", {
            diameter: 1.1,
            thickness: 0.1,
            tessellation: 30
        }, scene)
        bounds.material = boundMaterial
        this.bounds = bounds

        const shaft = CreateCylinder("shaft", {
            diameter: 0.1,
            height: 0.5
        }, scene)
        const arrow = CreateCylinder("arrow", {
            diameterTop: 0,
            diameterBottom: 0.2,
            height: 0.3
        },scene)
        arrow.position.y = 0.35;

        const vaneMaterial = new StandardMaterial("vaneMaterial", scene);
        vaneMaterial.disableLighting = true
        vaneMaterial.emissiveColor = Color3.White();
        vaneMaterial.alpha = 1

        const vane = Mesh.MergeMeshes([shaft, arrow])!
        vane.material = vaneMaterial
        this.vane = vane

        this.windDirection = 0;
        this.speed = 3;


        const relativeCenter = new Vector3(0, -1.5, 5);
        scene.onBeforeRenderObservable.add(() => {
            const relativePosition = this.calculateCoordsRelativeToCamera(relativeCenter)
            bounds.position = relativePosition
            bounds.rotation = new Vector3(Math.PI/2, 0, 0)

            const vaneRotation = new Vector3(Math.PI/2, this.windDirection, 0);
            vane.position = relativePosition
            vane.rotation = vaneRotation
        })


        scene.onBeforePhysicsObservable.add((scene) => {
            const windSpeed = this.speed * scene.deltaTime
            const force = new Vector3(Math.sin(this.windDirection), 0, Math.cos(this.windDirection)).normalize().scale(windSpeed);
            affectedEntities.forEach(e => e.body.applyForce(
                force,
                e.transformNode.absolutePosition
            ))
        })
    }

    calculateCoordsRelativeToCamera(relativeCoordinates: Vector3): Vector3 {
        const camera = this.scene.cameras[0];
        const center = camera.globalPosition;
        const relativeVector = relativeCoordinates.applyRotationQuaternion(camera.absoluteRotation)
        return center.add(relativeVector);
    }
}