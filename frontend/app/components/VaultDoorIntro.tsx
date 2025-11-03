'use client';

import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// Static vault door for entry screen (no animation)
function StaticVaultDoor() {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/402door.glb');

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

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
      // Pause after thud: 1.5 seconds
      // Keep door in forward position
      groupRef.current.position.z = 2;

      if (elapsed >= 1.5) {
        setPhase('rotate');
        startTime.current = Date.now();
      }
    } else if (phase === 'rotate') {
      // Spin and slide phase
      const progress = Math.min(elapsed / 4, 1);

      // Simple cubic ease-out: starts fast, slows down at end
      // But we'll invert it for ease-in: slow start, speeds up
      const easeProgress = progress * progress * progress;

      // Spin - 270 degrees over 4 seconds
      groupRef.current.rotation.z = easeProgress * Math.PI * 1.5;

      // Slide the door to the left - matches the rotation timing
      groupRef.current.position.x = -easeProgress * 10;

      // Keep the forward position from thud
      groupRef.current.position.z = 2;

      // Trigger fade after 2.5 seconds of rolling
      if (elapsed >= 2.5 && !fadeTriggered) {
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
  const [hasStarted, setHasStarted] = useState(false);
  const [finalFade, setFinalFade] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleEnterVault = () => {
    setHasStarted(true);

    // Play vault sound when animation starts
    audioRef.current = new Audio('/vault.mp3');
    audioRef.current.play().catch(err => {
      console.log('Audio playback failed:', err);
    });
  };

  const handleAnimationComplete = () => {
    // Start final fade to site
    setFinalFade(true);
    // Wait for fade animation to complete before removing intro
    setTimeout(() => {
      onComplete();
    }, 600);
  };

  useEffect(() => {
    return () => {
      // Cleanup: pause and reset audio when component unmounts
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, []);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      zIndex: 9999,
      opacity: finalFade ? 0 : 1,
      transition: 'opacity 0.6s ease-out',
    }}>
      {/* Blurred background layer - always visible during intro and animation */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundImage: 'url(/fallout-vault-hallway-v0-pt5hy06w1owc1.webp)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'blur(10px)',
        zIndex: 1,
      }} />

      {/* Dark overlay - always visible */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 2,
      }} />

      {/* 3D Vault Door Model layer - always present */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 3,
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
          {hasStarted ? (
            <VaultDoorModel onAnimationComplete={handleAnimationComplete} />
          ) : (
            <StaticVaultDoor />
          )}
        </Canvas>
      </div>

      {/* Button layer - fades out when animation starts */}
      {!hasStarted && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 4,
        }}>
          <button
            onClick={handleEnterVault}
            style={{
              fontSize: '2.5rem',
              padding: '1.5rem 3rem',
              backgroundColor: 'rgba(20, 254, 23, 0.2)',
              color: '#14fe17',
              border: '3px solid #14fe17',
              borderRadius: '8px',
              cursor: 'pointer',
              fontFamily: 'PipBoy, sans-serif',
              textShadow: '0px 0px 10px #14fe17',
              boxShadow: '0 0 20px rgba(20, 254, 23, 0.5)',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(20, 254, 23, 0.3)';
              e.currentTarget.style.boxShadow = '0 0 30px rgba(20, 254, 23, 0.8)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(20, 254, 23, 0.2)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(20, 254, 23, 0.5)';
            }}
          >
            ENTER VAULT
          </button>
        </div>
      )}
    </div>
  );
}
