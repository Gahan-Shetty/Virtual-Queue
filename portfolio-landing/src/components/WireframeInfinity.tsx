import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// Create a knot geometry made of lines
const InfinityGraphic = () => {
  const groupRef = useRef<THREE.Group>(null);
  
  // Create a parametric knot-like curve
  const curve = useMemo(() => {
    class TrefoilKnot extends THREE.Curve<THREE.Vector3> {
      constructor() {
        super();
      }
      getPoint(t: number, optionalTarget = new THREE.Vector3()) {
        const t2 = t * Math.PI * 2;
        // Infinity loop like parametric equation
        const x = Math.sin(t2) * 3;
        const y = Math.sin(t2 * 2) * 1.5;
        const z = Math.cos(t2) * 2;
        return optionalTarget.set(x, y, z);
      }
    }
    return new TrefoilKnot();
  }, []);

  // Animate the rotation slowly
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.1;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
    }
  });

  return (
    <group ref={groupRef} scale={1.2}>
      {/* Central tube geometry with wireframe */}
      <mesh>
        <tubeGeometry args={[curve, 200, 1.2, 32, true]} />
        <meshBasicMaterial color="#0ea5e9" wireframe transparent opacity={0.15} />
      </mesh>
      
      {/* Outer construction circles */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.5, 4.51, 64]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
      
      {/* Crosshairs on the construction circle */}
      {[0, Math.PI/2, Math.PI, Math.PI*1.5].map((angle, i) => (
        <group key={i} rotation={[0, angle, 0]}>
          <mesh position={[4.5, 0, 0]}>
            <boxGeometry args={[0.3, 0.02, 0.02]} />
            <meshBasicMaterial color="#0ea5e9" transparent opacity={0.5} />
          </mesh>
          <mesh position={[4.5, 0, 0]}>
            <boxGeometry args={[0.02, 0.3, 0.02]} />
            <meshBasicMaterial color="#0ea5e9" transparent opacity={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

const WireframeInfinity = () => {
  return (
    <div className="w-full h-full relative" style={{ opacity: 0.9 }}>
      <Canvas camera={{ position: [0, 0, 10], fov: 45 }}>
        <ambientLight intensity={1} />
        <InfinityGraphic />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate={false} />
      </Canvas>
    </div>
  );
};

export default WireframeInfinity;
