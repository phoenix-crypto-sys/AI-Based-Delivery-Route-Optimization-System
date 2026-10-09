import { useState, useEffect, useRef, useCallback } from 'react';
import type { SimulationState } from '../types/simulation';

const WS_URL = 'ws://127.0.0.1:8000/ws/simulation';
const API_BASE = 'http://127.0.0.1:8000/api';

export function useSimulationSocket() {
  const [state, setState] = useState<SimulationState | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [flashReRoute, setFlashReRoute] = useState<boolean>(false);
  const socketRef = useRef<WebSocket | null>(null);
  const prevNonceRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const reconnectTimerRef = useRef<any>(null);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;
    try {
      const ws = new WebSocket(WS_URL);
      socketRef.current = ws;

      ws.onopen = () => {
        if (isMountedRef.current) setConnected(true);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'TICK' || msg.type === 'STATE_UPDATE') {
            const newState: SimulationState = msg.payload;
            setState(newState);

            // Check if re-optimization occurred to trigger the visual flash
            if (newState.reroute_nonce !== prevNonceRef.current) {
              prevNonceRef.current = newState.reroute_nonce;
              setFlashReRoute(true);
              setTimeout(() => {
                if (isMountedRef.current) setFlashReRoute(false);
              }, 850);
            }
          }
        } catch (e) {
          console.error("Error parsing WebSocket message:", e);
        }
      };

      ws.onclose = () => {
        if (isMountedRef.current) {
          setConnected(false);
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        if (isMountedRef.current) {
          setConnected(false);
          try { ws.close(); } catch {}
        }
      };
    } catch {
      if (isMountedRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(connect, 2000);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    // Initial fallback fetch
    fetch(`${API_BASE}/state`)
      .then((res) => res.json())
      .then((data) => {
        if (isMountedRef.current) {
          setState(data);
          prevNonceRef.current = data.reroute_nonce || 0;
        }
      })
      .catch((err) => console.log("Initial state fetch awaiting server:", err));

    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  const sendAction = useCallback((action: string, payload: Record<string, any> = {}) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ action, ...payload }));
    } else {
      // HTTP fallback
      if (action === 'PLAY' || action === 'PAUSE' || action === 'STEP') {
        fetch(`${API_BASE}/simulation/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: action.toLowerCase() })
        });
      }
    }
  }, []);

  const play = useCallback(() => sendAction('PLAY'), [sendAction]);
  const pause = useCallback(() => sendAction('PAUSE'), [sendAction]);
  const togglePlay = useCallback(() => {
    if (state?.is_paused) {
      play();
    } else {
      pause();
    }
  }, [state?.is_paused, play, pause]);

  const setSpeed = useCallback((multiplier: number) => {
    sendAction('SET_SPEED', { speed: multiplier });
  }, [sendAction]);

  const addOrder = useCallback((x: number, y: number, demand = 2, priority = 'normal') => {
    sendAction('ADD_ORDER', { x, y, demand, priority });
  }, [sendAction]);

  const toggleBreakdown = useCallback((vehicleId: string) => {
    sendAction('TOGGLE_BREAKDOWN', { vehicle_id: vehicleId });
  }, [sendAction]);

  const optimize = useCallback((fastest: number, cheapest: number, greenest: number, trafficAware = true) => {
    sendAction('OPTIMIZE', {
      fastest_weight: fastest,
      cheapest_weight: cheapest,
      greenest_weight: greenest,
      traffic_aware: trafficAware
    });
  }, [sendAction]);

  const reset = useCallback(() => {
    fetch(`${API_BASE}/simulation/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' })
    }).then(res => res.json()).then(data => {
      if (data.state) setState(data.state);
    });
  }, []);

  return {
    state,
    connected,
    flashReRoute,
    play,
    pause,
    togglePlay,
    setSpeed,
    addOrder,
    toggleBreakdown,
    optimize,
    reset,
  };
}
