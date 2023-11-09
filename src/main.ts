import DroneEntity from "./drone"
import HavokPhysics from "@babylonjs/havok"
import "./style.css"
import { Engine } from "@babylonjs/core/Engines/engine"
import {HemisphericLight} from "@babylonjs/core/Lights/hemisphericLight";
import {ArcRotateCamera} from "@babylonjs/core/Cameras/arcRotateCamera";
import {HavokPlugin} from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import {Scene} from "@babylonjs/core/scene";
import Wind from "./wind";
import {Orchestrator} from "./orchestrator";

async function setupSimulation() {
    // create the canvas html element and attach it to the webpage
    let canvas = document.createElement("canvas")
    canvas.style.width = "100%"
    canvas.style.height = "100%"
    canvas.id = "gameCanvas"
    document.body.appendChild(canvas)

    // initialize babylon scene and engine
    let engine = new Engine(canvas, true)

    window.addEventListener("resize", () => {
        engine.resize()
    })

    let scene = new Scene(engine)

    const gravityVector = new Vector3(0, 0, 0)

    const physicsEngine = await HavokPhysics()
    const physicsPlugin = new HavokPlugin(true, physicsEngine)

    scene.enablePhysics(gravityVector, physicsPlugin)

    let camera: ArcRotateCamera = new ArcRotateCamera("Camera", Math.PI / 2, Math.PI * 3 / 8, 15, Vector3.Zero(), scene)
    camera.upperRadiusLimit = 35
    camera.lowerRadiusLimit = 3
    camera.panningSensibility = 0
    camera.wheelDeltaPercentage = 0.01
    camera.useAutoRotationBehavior = true
    camera.attachControl(canvas, true)

    new HemisphericLight("light", new Vector3(0, 1, 0), scene)

    const drone = new DroneEntity(scene)
    const wind = new Wind(scene, [drone.physics]);
    wind.speed = 0

    const boundSize = 10
    // run the main render loop
    engine.runRenderLoop(() => {
        scene.render()
    })

    let bounds = CreateSphere("bounds", {
        diameter: boundSize,
        sideOrientation: Mesh.BACKSIDE
    }, scene)
    const boundsMaterial = new StandardMaterial("boundsMaterial", scene)
    boundsMaterial.emissiveColor = Color3.FromHexString("#cffdff")
    boundsMaterial.wireframe = true
    boundsMaterial.disableLighting = true

    bounds.material = boundsMaterial

    let skybox = CreateBox("skybox", {
        size: 50,
        sideOrientation: Mesh.BACKSIDE
    })
    const skyboxMaterial = new StandardMaterial("skyboxMaterial", scene)
    skyboxMaterial.emissiveColor = Color3.FromHexString("#39d7ff")
    skyboxMaterial.disableLighting = true

    skybox.material = skyboxMaterial

    const orchestrator = new Orchestrator(scene, drone, wind, physicsPlugin, {
        stepInterval: 100,
        batchSize: 64,
        memorySize: 12_000,
        trainingSteps: 30_000,
        actorUpdateInterval: 2,
        gamma: 0.99,
        hiddenLayerSize: 64,
        numHiddenLayers: 2,
        boundDiameter: boundSize,
        epsilonDecay: 6_000,
        episodeLimit: 200,
        tau: 0.005,
        actorLR: 5e-6,
        criticLR: 5e-4
    }, true)
    orchestrator.start()
}

setupSimulation()