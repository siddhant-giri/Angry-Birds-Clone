import { useEffect, useRef, useState, useCallback } from "react";
import {
  Engine,
  Render,
  Runner,
  World,
  Bodies,
  Composite,
  Mouse,
  MouseConstraint,
  Constraint,
  Vector,
  Events,
  Body,
  Collision,
} from "matter-js";
import "./App.css";

// Update these import statements
const blockImage = "/block.png";
const birdImage = "/bird.png";
const slingshotImage = "/sling.png";
const backgroundImage = "/background.png"; // Add this line

function App() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const engineRef = useRef<Matter.Engine | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const worldRef = useRef<Matter.World | null>(null);

  // Function to create pyramid of boxes
  const createPyramid = useCallback(() => {
    if (!engineRef.current || !worldRef.current) return;

    const pyramidRows = 10;
    const boxSize = 60;
    const pyramidX = (window.innerWidth * 3) / 4;
    const pyramidHeight = pyramidRows * boxSize;
    const pyramidY = window.innerHeight - pyramidHeight / 2;

    const boxes = [];

    for (let row = 0; row < pyramidRows; row++) {
      for (let col = 0; col <= row; col++) {
        const x = pyramidX + (col - row / 2) * boxSize;
        const y = pyramidY + (row - pyramidRows / 2) * boxSize;
        const box = Bodies.rectangle(x, y, boxSize, boxSize, {
          render: {
            sprite: {
              texture: blockImage,
              xScale: boxSize / 128,
              yScale: boxSize / 128,
            },
          },
          label: "box",
        });
        boxes.push(box);
      }
    }

    Composite.add(worldRef.current, boxes);
  }, []);

  useEffect(() => {
    if (!sceneRef.current) return;

    // Create engine and world
    const engine = Engine.create();
    engineRef.current = engine;
    const world = engine.world;
    worldRef.current = world;

    // Create renderer
    const render = Render.create({
      element: sceneRef.current,
      engine: engine,
      options: {
        width: window.innerWidth,
        height: window.innerHeight,
        wireframes: false,
        background: "transparent", // Keep this as transparent
      },
    });

    // Create runner
    const runner = Runner.create();

    // Create ground (moved to the bottom of the screen)
    const ground = Bodies.rectangle(
      window.innerWidth / 2,
      window.innerHeight,
      window.innerWidth,
      50,
      {
        isStatic: true,
        render: {
          fillStyle: "transparent",
          strokeStyle: "transparent",
        },
        label: "ground", // Add a label to identify the ground
      }
    );

    // Remove the tower creation code and replace it with the slingshot image
    const slingshotWidth = 100; // Adjust this value based on your image
    const slingshotHeight = 150; // Adjust this value based on your image
    const slingshotX = window.innerWidth / 4;
    const slingshotY = window.innerHeight - slingshotHeight / 2;

    const slingshot = Bodies.rectangle(
      slingshotX,
      slingshotY,
      slingshotWidth,
      slingshotHeight,
      {
        isStatic: true,
        render: {
          sprite: {
            texture: slingshotImage,
            xScale: slingshotWidth / 128, // Adjust scale as needed
            yScale: slingshotHeight / 128, // Adjust scale as needed
          },
        },
        collisionFilter: {
          group: -1, // Negative group for the slingshot
        },
      }
    );

    // Add slingshot to the world
    Composite.add(world, slingshot);

    // Function to create and position the bird
    const createBird = () => {
      const ballRadius = 50;
      const ball = Bodies.circle(
        slingshotX,
        slingshotY - slingshotHeight / 2 - ballRadius,
        ballRadius,
        {
          restitution: 0.8,
          render: {
            sprite: {
              texture: birdImage,
              xScale: (ballRadius * 2) / 128,
              yScale: (ballRadius * 2) / 128,
            },
          },
          collisionFilter: {
            group: -1,
          },
        }
      );
      ballRef.current = ball;
      return ball;
    };

    // Create initial bird
    const ball = createBird();

    // Update the fixed point for the slingshot constraint
    const fixedPoint = {
      x: slingshotX,
      y: slingshotY - slingshotHeight / 2,
    };

    // Create the slingshot constraint
    let slingshotConstraint = Constraint.create({
      pointA: fixedPoint,
      bodyB: ball,
      stiffness: 0.01,
      damping: 0.1,
      render: {
        visible: true,
        lineWidth: 2,
        strokeStyle: "#FFA500",
      },
    });

    // Add ball and constraint to the world
    Composite.add(world, [ball, slingshotConstraint]);

    // Add mouse control
    const mouse = Mouse.create(render.canvas);
    const mouseConstraint = MouseConstraint.create(engine, {
      mouse: mouse,
      constraint: {
        stiffness: 0.2,
        render: {
          visible: false,
        },
      },
    });

    // Add event listener for mouse release
    Events.on(
      mouseConstraint,
      "enddrag",
      (event: Matter.IEvent<Matter.MouseConstraint>) => {
        const mouseEvent = event as unknown as { body: Matter.Body };
        if (mouseEvent.body === ballRef.current) {
          // Remove the constraint
          Composite.remove(world, slingshotConstraint);

          // Calculate the force to apply
          const force = Vector.sub(fixedPoint, ballRef.current.position);
          const powerFactor = 0.004;

          // Apply the force to the ball
          Body.applyForce(ballRef.current, ballRef.current.position, Vector.mult(force, powerFactor));

          // Set a timeout to reset the bird position
          setTimeout(() => {
            if (engineRef.current && ballRef.current) {
              // Remove the old bird
              Composite.remove(engineRef.current.world, ballRef.current);

              // Create and add a new bird
              const newBall = createBird();
              Composite.add(engineRef.current.world, newBall);

              // Create a new constraint
              slingshotConstraint = Constraint.create({
                pointA: fixedPoint,
                bodyB: newBall,
                stiffness: 0.01,
                damping: 0.1,
                render: {
                  visible: true,
                  lineWidth: 2,
                  strokeStyle: "#FFA500",
                },
              });
              Composite.add(engineRef.current.world, slingshotConstraint);
            }
          }, 3000); // Wait for 3 seconds before resetting
        }
      }
    );

    // Add mouseConstraint to the world
    Composite.add(world, mouseConstraint);

    // Sync the mouse with the renderer
    render.mouse = mouse;

    // Create initial pyramid
    createPyramid();

    // Add collision detection for boxes touching the ground
    Events.on(engine, "collisionStart", (event) => {
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        if (
          (bodyA.label === "box" && bodyB.label === "ground") ||
          (bodyA.label === "ground" && bodyB.label === "box")
        ) {
          // Box touched the ground, increase score
          setScore((prevScore) => prevScore + 10);
        }
      });
    });

    // Add ground to the world
    Composite.add(world, ground);

    // Run the engine, renderer, and runner
    Render.run(render);
    Runner.run(runner, engine);

    // Cleanup on component unmount
    return () => {
      Render.stop(render);
      Runner.stop(runner);
      World.clear(world, false);
      Engine.clear(engine);
      render.canvas.remove();
      Mouse.clearSourceEvents(mouse);
      engineRef.current = null;
      ballRef.current = null;
      worldRef.current = null;
    };
  }, [createPyramid]);

  // Function to reset the game
  const resetGame = useCallback(() => {
    setScore(0);
    if (engineRef.current && worldRef.current) {
      // Remove all boxes
      const boxes = Composite.allBodies(worldRef.current).filter(body => body.label === "box");
      Composite.remove(worldRef.current, boxes);

      // Recreate pyramid
      createPyramid();

      // Reset bird position
      if (ballRef.current) {
        Body.setPosition(ballRef.current, {
          x: window.innerWidth / 4,
          y: window.innerHeight - 200 - 50,
        });
        Body.setVelocity(ballRef.current, { x: 0, y: 0 });
        Body.setAngularVelocity(ballRef.current, 0);
      }
    }
  }, [createPyramid]);

  return (
    <div className="game-container">
      <div 
        className="background" 
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          zIndex: -1,
        }}
      />
      <div ref={sceneRef} style={{ position: "relative", zIndex: 1 }} />
      <div 
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          fontSize: "24px",
          fontWeight: "bold",
          color: "white",
          zIndex: 2,
        }}
      >
        Score: {score}
      </div>
      <button
        onClick={resetGame}
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          padding: "10px 20px",
          fontSize: "18px",
          backgroundColor: "#4CAF50",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
          zIndex: 2,
        }}
      >
        Reset Game
      </button>
    </div>
  );
}

export default App;
