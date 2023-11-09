import * as earcut from "earcut"
import streak from "./textures/streak.png"
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial"
import {Texture} from "@babylonjs/core/Materials/Textures/texture"
import {PBRMetallicRoughnessMaterial} from "@babylonjs/core/Materials/PBR/pbrMetallicRoughnessMaterial"
import {PhysicsAggregate} from "@babylonjs/core/Physics/v2/physicsAggregate"
import {PhysicsShapeType} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin"
import {Vector2, Vector3} from "@babylonjs/core/Maths/math.vector"
import {Color3, Color4} from "@babylonjs/core/Maths/math.color"
import {GPUParticleSystem} from "@babylonjs/core/Particles/gpuParticleSystem"
import {ParticleSystem} from "@babylonjs/core/Particles/particleSystem"
import {SphereDirectedParticleEmitter} from "@babylonjs/core/Particles/EmitterTypes/sphereParticleEmitter"
import {Mesh} from "@babylonjs/core/Meshes/mesh"
import {Scene} from "@babylonjs/core/scene"
import "@babylonjs/core/Animations"
import {Animation} from "@babylonjs/core/Animations/animation"
import {Animatable} from "@babylonjs/core/Animations/animatable"
import "@babylonjs/core/Physics/joinedPhysicsEngineComponent"
import {ExtrudePolygon} from "@babylonjs/core/Meshes/Builders/polygonBuilder"
import {CreateCylinder} from "@babylonjs/core/Meshes/Builders/cylinderBuilder"
import {IAnimationKey} from "@babylonjs/core";
import {CreateSphere} from "@babylonjs/core/Meshes/Builders/sphereBuilder";


export default class DroneEntity {
    public mesh: Mesh
    private direction: number[]
    private speed : number
    private propAnimations: Animatable[]
    private readonly reversedAnimations: number[]
    private readonly scene: Scene
    public readonly physics: PhysicsAggregate
    private directionSphere: Mesh;

    constructor(scene: Scene) {
        this.scene = scene

        let structure1 = CreateCylinder("structure1", {
            tessellation: 6,
            diameter: 0.06,
            height: 1
        }, scene)
        let structure2 = structure1.clone("structure2")

        structure1.rotation.z = Math.PI / 4
        structure2.rotation.z = -Math.PI / 4

        let centerStructure = CreateCylinder("center", {
            diameter: 0.2,
            height: 0.1
        }, scene)
        centerStructure.rotation.x = Math.PI / 2

        let edgeStructure1 = CreateCylinder("edge1", {
            diameter: 0.08,
            height: 0.15
        })
        edgeStructure1.rotation.x = Math.PI / 2
        edgeStructure1.position.x = Math.sqrt(0.5) / 2
        edgeStructure1.position.y = Math.sqrt(0.5) / 2

        let edgeStructure2 = edgeStructure1.clone()
        edgeStructure2.position.x = -Math.sqrt(0.5) / 2
        edgeStructure2.position.y = -Math.sqrt(0.5) / 2

        let edgeStructure3 = edgeStructure1.clone()
        edgeStructure3.position.x = Math.sqrt(0.5) / 2
        edgeStructure3.position.y = -Math.sqrt(0.5) / 2

        let edgeStructure4 = edgeStructure1.clone()
        edgeStructure4.position.x = -Math.sqrt(0.5) / 2
        edgeStructure4.position.y = Math.sqrt(0.5) / 2

        const drone = Mesh.MergeMeshes([structure1, structure2, centerStructure,
            edgeStructure1, edgeStructure2, edgeStructure3, edgeStructure4])!

        const material = new PBRMetallicRoughnessMaterial("droneMaterial", scene)
        material.baseColor = new Color3(0.7, 0.7, 0.7)
        material.emissiveColor = new Color3(0.2, 0.2, 0.2)
        material.metallic = 0
        material.roughness = 1

        drone.material = material

        const propShape = [
            new Vector3(0.01, 0, 0.003),
            new Vector3(-0.01, 0, 0.003),
            new Vector3(-0.01, 0, -0.003),
            new Vector3(0.01, 0, -0.003),
        ]

        const blade1 = ExtrudePolygon("blade1", {
            shape: propShape,
            depth: 0.25,
        }, scene, earcut.default)
        blade1.position.y = 0.25 / 2
        const blade2 = blade1.clone("blade2")

        blade1.rotateAround(new Vector3(0, 0, 0), new Vector3(0, 0, 1), Math.PI / 4)
        blade2.rotateAround(new Vector3(0, 0, 0), new Vector3(0, 0, 1), -Math.PI / 4)

        const blackMaterial = new StandardMaterial("blackMaterial", scene)
        blackMaterial.disableLighting = true
        blackMaterial.diffuseColor = new Color3(0.15, 0.15, 0.15)

        const animationKeys: IAnimationKey[] = []
        animationKeys.push({
            frame: 0,
            value: 0
        })
        animationKeys.push({
            frame: 30,
            value: 2 * Math.PI
        })

        const propAnimation = new Animation("propAnimation", "rotation.z", 30,
            Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE)
        propAnimation.setKeys(animationKeys)

        const prop1 = Mesh.MergeMeshes([blade1, blade2])!
        prop1.parent = drone
        prop1.position.z = 0.15 / 2 + 0.005
        prop1.material = blackMaterial
        prop1.animations = [propAnimation]

        const prop2 = prop1.clone("prop2")
        const prop3 = prop1.clone("prop3")
        const prop4 = prop1.clone("prop4")

        prop1.position.x = Math.sqrt(0.5) / 2
        prop1.position.y = Math.sqrt(0.5) / 2

        prop2.position.x = -Math.sqrt(0.5) / 2
        prop2.position.y = Math.sqrt(0.5) / 2

        prop3.position.x = -Math.sqrt(0.5) / 2
        prop3.position.y = -Math.sqrt(0.5) / 2

        prop4.position.x = Math.sqrt(0.5) / 2
        prop4.position.y = -Math.sqrt(0.5) / 2

        this.direction = [0, 0, 0]
        this.speed = 0

        this.propAnimations = []
        this.propAnimations.push(scene.beginAnimation(prop1, 0, 30, true))
        this.propAnimations.push(scene.beginAnimation(prop2, 0, 30, true))
        this.propAnimations.push(scene.beginAnimation(prop3, 0, 30, true))
        this.propAnimations.push(scene.beginAnimation(prop4, 0, 30, true))
        this.reversedAnimations = [1, -1, -1, 1]

        for(let prop=0;prop<this.propAnimations.length;prop++) {
            this.propAnimations[prop].speedRatio = this.reversedAnimations[prop] * 2
        }

        drone.rotation.x = -Math.PI / 2

        const prop1Particles = this.configureParticleEmitter(prop1)
        const prop2Particles = this.configureParticleEmitter(prop2)
        const prop3Particles = this.configureParticleEmitter(prop3)
        const prop4Particles = this.configureParticleEmitter(prop4)

        prop1Particles.start()
        prop2Particles.start()
        prop3Particles.start()
        prop4Particles.start()

        this.physics = new PhysicsAggregate(drone, PhysicsShapeType.BOX, {mass: 1}, scene)

        scene.onBeforePhysicsObservable.add(() => {
            this.applyForces()
        })

        this.setAction([0, 0, 0, 0])

        const directionSphere = CreateSphere("direction", {
            diameter: 0.1
        }, scene)
        const directionSphereMaterial = new StandardMaterial("directionSphereMaterial", scene)
        directionSphereMaterial.disableLighting = true
        directionSphereMaterial.emissiveColor = Color3.White()
        directionSphereMaterial.alpha = 0.5
        directionSphere.material = directionSphereMaterial
        this.directionSphere = directionSphere

        this.mesh = drone
    }

    private configureParticleEmitter(emitter: Mesh): ParticleSystem | GPUParticleSystem {
        let propParticles: ParticleSystem | GPUParticleSystem
        propParticles = new ParticleSystem("prop1Particles", 1000, this.scene)
        const prop1Emitter = new SphereDirectedParticleEmitter(0.12, new Vector3(0, 0, -1), new Vector3(0, 0, -1))
        propParticles.emitter = emitter
        propParticles.particleEmitterType = prop1Emitter
        propParticles.particleTexture = new Texture(streak)
        propParticles.translationPivot = new Vector2(0, -0.1)
        propParticles.minSize = 0.02
        propParticles.maxSize = 0.03
        propParticles.color1 = new Color4(0, 0, 0, 0)
        propParticles.color2 = new Color4(1, 1, 1, 1)
        propParticles.colorDead = new Color4(0, 0, 0, 0)
        propParticles.direction1 = new Vector3(0, 0, -10)
        propParticles.direction2 = new Vector3(0, 0, -10)
        propParticles.gravity = new Vector3(0, 0, 0)
        const particleDistance = 0.04
        const particleSpeed = 3 / 10
        const particleLife = particleDistance / particleSpeed

        propParticles.emitRate = 50
        propParticles.minLifeTime = particleLife
        propParticles.maxLifeTime = particleLife + 0.01
        propParticles.minEmitPower = particleSpeed
        propParticles.maxEmitPower = particleSpeed

        return propParticles
    }

    setAction(action: number[]) {
        const [rx, ry, rz, speed] = action
        this.direction = [rx, ry, rz]
        this.speed = speed
    }


    applyForces() {
        const angleVector = new Vector3(this.direction[0], this.direction[1], this.direction[2])

        const direction = angleVector.scale((this.speed * 2 - 1) * 2)
        this.physics.body.applyForce(direction, this.mesh.absolutePosition)
        this.directionSphere.position = this.mesh.absolutePosition.add(direction)
    }

    reset(position: Vector3) {
        this.physics.body.disablePreStep = false
        this.physics.body.setAngularVelocity(Vector3.Zero())
        this.physics.body.setLinearVelocity(Vector3.Zero())
        this.physics.transformNode.setAbsolutePosition(position)
        this.physics.transformNode.rotation = new Vector3(-Math.PI/2, 0, 0)
        this.setAction([0, 0, 0, 0])
        this.scene.onAfterRenderObservable.addOnce(() => {
            this.physics.body.disablePreStep = true
        })
    }
}