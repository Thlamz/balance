import "@babylonjs/core/Debug/debugLayer"
import "@babylonjs/inspector"
import {
    Engine,
    Scene,
    ArcRotateCamera,
    Vector3,
    HemisphericLight, Color3, MeshBuilder, Mesh, StandardMaterial, HavokPlugin
} from "@babylonjs/core"
import DroneEntity from "./drone"
import HavokPhysics from "@babylonjs/havok"
import "./style.css"

const physicsEngine = await HavokPhysics()

class App {
    constructor() {
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

        const gravityVector = new Vector3(0, -9.81, 0)

        const physicsPlugin = new HavokPlugin(true, physicsEngine)
        scene.enablePhysics(gravityVector, physicsPlugin)

        let camera: ArcRotateCamera = new ArcRotateCamera("Camera", Math.PI / 2, Math.PI * 3 / 8, 15, Vector3.Zero(), scene)
        camera.upperRadiusLimit = 35
        camera.lowerRadiusLimit = 3
        camera.panningSensibility = 0
        camera.wheelDeltaPercentage = 0.01
        camera.useAutoRotationBehavior = true
        camera.attachControl(canvas, true)

        let light = new HemisphericLight("light", new Vector3(0, 1, 0), scene)


        let drone = new DroneEntity("drone1", scene)

        // hide/show the Inspector
        window.addEventListener("keydown", (ev) => {
            // Shift+Ctrl+Alt+I
            if (ev.shiftKey && ev.ctrlKey && ev.altKey && ev.key === "I") {
                if (scene.debugLayer.isVisible()) {
                    scene.debugLayer.hide()
                } else {
                    scene.debugLayer.show()
                }
            }
        })


        const boundSize = 10
        // run the main render loop
        engine.runRenderLoop(() => {
            scene.render()
        })

        scene.onBeforePhysicsObservable.add(() => {
            if(drone.mesh.absolutePosition.lengthSquared() > (boundSize/2) * (boundSize/2)) {
                drone.reset()
            }
        })

        let bounds = MeshBuilder.CreateSphere("bounds", {
            diameter: boundSize,
            sideOrientation: Mesh.BACKSIDE
        }, scene)
        const boundsMaterial = new StandardMaterial("boundsMaterial", scene)
        boundsMaterial.emissiveColor = Color3.FromHexString("#cffdff")
        boundsMaterial.wireframe = true
        boundsMaterial.disableLighting = true

        bounds.material = boundsMaterial

        let skybox = MeshBuilder.CreateBox("skybox", {
            size: 50,
            sideOrientation: Mesh.BACKSIDE
        })
        const skyboxMaterial = new StandardMaterial("skyboxMaterial", scene)
        skyboxMaterial.emissiveColor = Color3.FromHexString("#39d7ff")
        skyboxMaterial.disableLighting = true

        skybox.material = skyboxMaterial
    }
}

new App()