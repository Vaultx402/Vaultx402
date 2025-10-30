'use client';

import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

interface VaultDoorModelProps {
  onAnimationComplete: () => void;
}

function VaultDoorModel({ onAnimationComplete }: VaultDoorModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/402door.glb');
  const [phase, setPhase] = useState<'zoom' | 'pause1' | 'thud' | 'pause2' | 'rotate' | 'done'>('zoom');
  const [fadeTriggered, setFadeTriggered] = useState(false);
  const startTime = useRef(Date.now());

  useFrame((state) => {
    if (!groupRef.current) return;

    const elapsed = (Date.now() - startTime.current) / 1000; // time in seconds

    if (phase === 'zoom') {
      // Zoom in phase: 0 to 2 seconds (faster)
      // Camera moves from far away (z=50) to medium distance (z=10)
      const progress = Math.min(elapsed / 2, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3); // ease out cubic
      state.camera.position.z = 50 - (40 * easeProgress); // stops at z=10

      if (progress >= 1) {
        setPhase('pause1');
        startTime.current = Date.now();
      }
    } else if (phase === 'pause1') {
      // Pause after zoom: 0.8 seconds
      if (elapsed >= 0.8) {
        setPhase('thud');
        startTime.current = Date.now();
      }
    } else if (phase === 'thud') {
      // Initial "thud" phase: 0 to 0.5 seconds
      // Door moves forward toward camera (unsealing), like unlocking
      const progress = Math.min(elapsed / 0.5, 1);
      const easeProgress = progress < 0.5
        ? 2 * progress * progress // ease in for first half
        : 1 - Math.pow(-2 * progress + 2, 2) / 2; // ease out for second half

      // Move door forward toward camera (positive Z direction)
      groupRef.current.position.z = easeProgress * 2;

      if (progress >= 1) {
        setPhase('pause2');
        startTime.current = Date.now();
      }
    } else if (phase === 'pause2') {
      // Pause after thud: 0.5 seconds
      // Keep door in forward position
      groupRef.current.position.z = 2;

      if (elapsed >= 0.5) {
        setPhase('rotate');
        startTime.current = Date.now();
      }
    } else if (phase === 'rotate') {
      // Spin and slide phase: continues for full duration even during fade
      // Door spins and slides left while maintaining forward position
      const progress = Math.min(elapsed / 7, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3); // ease out cubic

      // Slower spin - only 270 degrees (3/4 rotation) over 7 seconds
      groupRef.current.rotation.z = easeProgress * Math.PI * 1.5;

      // Slide the door to the left - matches the rotation timing
      groupRef.current.position.x = -easeProgress * 10;

      // Keep the forward position from thud
      groupRef.current.position.z = 2;

      // Trigger fade after 3 seconds of rolling, but keep animating
      if (elapsed >= 3 && !fadeTriggered) {
        setFadeTriggered(true);
        onAnimationComplete();
      }
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

interface VaultDoorIntroProps {
  onComplete: () => void;
}

export default function VaultDoorIntro({ onComplete }: VaultDoorIntroProps) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: '#000',
      zIndex: 9999,
    }}>
      <Canvas
        camera={{ position: [0, 0, 50], fov: 45 }}
        style={{ width: '100%', height: '100%' }}
      >
        <ambientLight intensity={0.8} />
        <directionalLight position={[0, 5, 10]} intensity={1.5} />
        <directionalLight position={[5, 0, 5]} intensity={0.8} />
        <directionalLight position={[-5, 0, 5]} intensity={0.8} />
        <spotLight position={[0, 0, 15]} intensity={1} angle={0.6} penumbra={0.5} />
        <VaultDoorModel onAnimationComplete={onComplete} />
      </Canvas>
    </div>
  );
}
