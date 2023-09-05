import {
    Animatable,
    Animation,
    Color3, Color4, GPUParticleSystem,
    Mesh,
    MeshBuilder, ParticleSystem,
    PBRMetallicRoughnessMaterial, PhysicsAggregate, PhysicsShapeType, Plane,
    Scene, SphereDirectedParticleEmitter,
    StandardMaterial, Texture, Vector2,
    Vector3
} from "@babylonjs/core"
import * as earcut from "earcut"
import streak from "textures/streak.png"


export default class DroneEntity {
    public mesh: Mesh
    private props: Mesh[]
    private propSpeeds: number[]
    private propAnimations: Animatable[]
    private propParticleEmitters: (ParticleSystem | GPUParticleSystem)[]
    private readonly reversedAnimations: number[]
    private readonly scene: Scene
    private readonly physics: PhysicsAggregate

    constructor(scene: Scene) {
        this.scene = scene

        let structure1 = MeshBuilder.CreateCylinder("structure1", {
            tessellation: 6,
            diameter: 0.06,
            height: 1
        }, scene)
        let structure2 = structure1.clone("structure2")

        structure1.rotation.z = Math.PI / 4
        structure2.rotation.z = -Math.PI / 4

        let centerStructure = MeshBuilder.CreateCylinder("center", {
            diameter: 0.2,
            height: 0.1
        }, scene)
        centerStructure.rotation.x = Math.PI / 2

        let edgeStructure1 = MeshBuilder.CreateCylinder("edge1", {
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

        const blade1 = MeshBuilder.ExtrudePolygon("blade1", {
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

        const animationKeys = []
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

        this.props = [prop1, prop2, prop3, prop4]

        this.propSpeeds = [0, 0, 0, 0]

        this.propAnimations = []
        this.propAnimations.push(scene.beginAnimation(prop1, 0, 30, true))
        this.propAnimations.push(scene.beginAnimation(prop2, 0, 30, true))
        this.propAnimations.push(scene.beginAnimation(prop3, 0, 30, true))
        this.propAnimations.push(scene.beginAnimation(prop4, 0, 30, true))
        this.reversedAnimations = [1, -1, -1, 1]

        drone.rotation.x = -Math.PI / 2

        const prop1Particles = this.configureParticleEmitter(prop1)
        const prop2Particles = this.configureParticleEmitter(prop2)
        const prop3Particles = this.configureParticleEmitter(prop3)
        const prop4Particles = this.configureParticleEmitter(prop4)

        prop1Particles.start()
        prop2Particles.start()
        prop3Particles.start()
        prop4Particles.start()

        this.propParticleEmitters = [prop1Particles, prop2Particles, prop3Particles, prop4Particles]

        this.physics = new PhysicsAggregate(drone, PhysicsShapeType.BOX, {mass: 1}, scene)

        scene.onBeforePhysicsObservable.add(() => {
            this.applyForces()
        })

        this.setPropSpeed(1)

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
        return propParticles
    }

    setPropSpeed(speed: number, prop: number | undefined = undefined) {
        if (prop === undefined) {
            for (let index = 0; index < this.propSpeeds.length; index++) {
                this.setPropSpeed(speed, index)
            }
            return
        }

        const particleDistance = 0.04
        const particleSpeed = speed * 3 / 10
        const particleLife = particleDistance / particleSpeed

        const particlesPerSecond = speed * 50

        this.propAnimations[prop].speedRatio = speed * this.reversedAnimations[prop] * 2

        this.propParticleEmitters[prop].emitRate = particlesPerSecond
        this.propParticleEmitters[prop].minLifeTime = particleLife
        this.propParticleEmitters[prop].maxLifeTime = particleLife + 0.01
        this.propParticleEmitters[prop].minEmitPower = particleSpeed
        this.propParticleEmitters[prop].maxEmitPower = particleSpeed

        this.propSpeeds[prop] = speed
    }

    applyForces() {
        const angle = Plane.FromPoints(this.props[0].absolutePosition,
            this.props[1].absolutePosition,
            this.props[2].absolutePosition).normal
        for (let index = 0; index < this.propSpeeds.length; index++) {
            const speed = this.propSpeeds[index] * 10 / 4
            const direction = angle.multiply(new Vector3(speed, speed, speed))
            this.physics.body.applyForce(direction, this.props[index].absolutePosition)
        }
    }

    reset() {
        this.physics.body.disablePreStep = false
        this.physics.body.setAngularVelocity(Vector3.Zero())
        this.physics.body.setLinearVelocity(Vector3.Zero())
        this.physics.transformNode.setAbsolutePosition(Vector3.Zero())
        this.setPropSpeed(1)
        this.scene.onAfterRenderObservable.addOnce(() => {
            this.physics.body.disablePreStep = true
        })
    }
}