import { useState, useEffect, useRef, useCallback } from 'react';
import type { LiveOperationsState } from '../types/live';

export function useLiveSocket() {
  const [liveState, setLiveState] = useState<LiveOperationsState | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [flashReRoute, setFlashReRoute] = useState<boolean>(false);
  const socketRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const reconnectTimerRef = useRef<any>(null);

  const fetchLiveState = useCallback(async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/live/state');
      if (res.ok && isMountedRef.current) {
        const data = await res.json();
        setLiveState(data);
      }
    } catch (err) {
      console.warn('Failed to fetch REST live state:', err);
    }
  }, []);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;
    try {
      const ws = new WebSocket('ws://127.0.0.1:8000/ws/live');
      socketRef.current = ws;

      ws.onopen = () => {
        if (isMountedRef.current) setConnected(true);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'INIT_STATE' && msg.payload) {
            setLiveState(msg.payload);
          } else if (msg.state) {
            setLiveState(msg.state);
            if (msg.type === 'ROUTES_OPTIMIZED' || msg.type === 'ORDER_CREATED') {
              setFlashReRoute(true);
              setTimeout(() => {
                if (isMountedRef.current) setFlashReRoute(false);
              }, 2000);
            }
          }
        } catch (err) {
          console.error('Error parsing live WS message:', err);
        }
      };

      ws.onclose = () => {
        if (isMountedRef.current) {
          setConnected(false);
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        if (isMountedRef.current) {
          setConnected(false);
        }
      };
    } catch {
      if (isMountedRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(connect, 3000);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchLiveState();
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [fetchLiveState, connect]);

  const sendGPSPing = async (vehicleId: string, lat: number, lng: number, heading = 0, speedKmh = 0) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/live/vehicles/${vehicleId}/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, heading, speed_kmh: speedKmh }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.state) setLiveState(data.state);
      }
    } catch (err) {
      console.error('Error sending GPS ping:', err);
    }
  };

  const addLiveOrder = async (orderData: {
    customer_name: string;
    address: string;
    lat?: number;
    lng?: number;
    demand?: number;
    priority?: string;
  }) => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/live/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.state) setLiveState(data.state);
      }
    } catch (err) {
      console.error('Error adding live order:', err);
    }
  };

  const importCSV = async (csvContent: string) => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/live/orders/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_content: csvContent }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.state) setLiveState(data.state);
        return data.count || 0;
      }
    } catch (err) {
      console.error('Error importing CSV:', err);
    }
    return 0;
  };

  const markDelivered = async (orderId: string, vehicleId?: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/live/orders/${orderId}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicle_id: vehicleId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.state) setLiveState(data.state);
      }
    } catch (err) {
      console.error('Error marking delivered:', err);
    }
  };

  const triggerOptimize = async (weights?: { fastest: number; cheapest: number; greenest: number }) => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/live/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: weights ? JSON.stringify(weights) : undefined,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.state) setLiveState(data.state);
      }
    } catch (err) {
      console.error('Error triggering optimization:', err);
    }
  };

  const toggleVehicleFailover = async (vehicleId: string) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/live/vehicles/${vehicleId}/failover`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.state) setLiveState(data.state);
        return data.is_offline;
      }
    } catch (err) {
      console.error('Error toggling vehicle failover:', err);
    }
    return false;
  };

  return {
    liveState,
    connected,
    flashReRoute,
    sendGPSPing,
    addLiveOrder,
    importCSV,
    markDelivered,
    triggerOptimize,
    toggleVehicleFailover,
    refresh: fetchLiveState,
  };
}
