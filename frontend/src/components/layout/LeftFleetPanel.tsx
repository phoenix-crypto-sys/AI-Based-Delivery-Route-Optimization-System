import React, { useState } from 'react';
import { Truck, Package, AlertCircle, CheckCircle, Plus, Battery, Navigation, RotateCw } from 'lucide-react';
import type { SimulationState } from '../../types/simulation';

interface LeftFleetPanelProps {
  state: SimulationState | null;
  onToggleBreakdown: (vehicleId: string) => void;
  onAddOrder: (x: number, y: number, demand: number, priority: string) => void;
}

export const LeftFleetPanel: React.FC<LeftFleetPanelProps> = ({
  state,
  onToggleBreakdown,
  onAddOrder,
}) => {
  const [activeTab, setActiveTab] = useState<'fleet' | 'orders'>('fleet');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newOrderDemand, setNewOrderDemand] = useState(3);
  const [newOrderPriority, setNewOrderPriority] = useState<'urgent' | 'high' | 'normal'>('high');

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const x = Math.floor(160 + Math.random() * 680);
    const y = Math.floor(120 + Math.random() * 560);
    onAddOrder(x, y, newOrderDemand, newOrderPriority);
    setShowAddModal(false);
  };

  const pendingOrders = state?.orders.filter(o => o.status !== 'delivered') || [];
  const deliveredOrders = state?.orders.filter(o => o.status === 'delivered') || [];

  return (
    <aside className="absolute left-5 top-20 bottom-24 w-84 md:w-96 z-20 flex flex-col glass-panel rounded-xl overflow-hidden border border-slate-800/90 shadow-xl">
      {/* Panel Tab Navigation */}
      <div className="flex border-b border-slate-800 bg-slate-900/60 p-1.5 gap-1.5">
        <button
          onClick={() => setActiveTab('fleet')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-display font-semibold transition-all ${
            activeTab === 'fleet'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Truck className="w-3.5 h-3.5 text-blue-400" />
          Fleet Roster ({state?.vehicles.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-display font-semibold transition-all ${
            activeTab === 'orders'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Package className="w-3.5 h-3.5 text-blue-400" />
          Orders ({pendingOrders.length})
        </button>
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {activeTab === 'fleet' ? (
          state?.vehicles.map((v) => {
            const isBroken = v.status === 'broken';
            const loadRatio = Math.min(100, Math.round((v.assigned_order_ids.length / v.capacity) * 100));

            return (
              <div
                key={v.id}
                className={`p-3.5 rounded-lg border transition-all ${
                  isBroken
                    ? 'bg-rose-950/20 border-rose-500/30'
                    : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                {/* Vehicle Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: isBroken ? '#FB7185' : v.color }}
                    />
                    <div>
                      <h4 className="text-xs font-display font-bold text-white">{v.name}</h4>
                      <span className="text-[10px] font-telemetry text-slate-400">
                        {v.id} • {Math.round(v.speed_kmh)} km/h
                      </span>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-body font-medium ${
                      isBroken
                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        : v.status === 'en_route'
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isBroken ? 'Offline' : v.status === 'en_route' ? 'En Route' : 'Idle'}
                  </span>
                </div>

                {/* Metrics */}
                <div className="space-y-1.5 text-xs text-slate-300 my-2.5 font-body">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Payload:</span>
                    <span className="font-telemetry text-slate-200">
                      {v.assigned_order_ids.length} / {v.capacity} stops
                    </span>
                  </div>
                  <div className="w-full h-1 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${loadRatio}%`,
                        backgroundColor: v.color,
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="flex items-center gap-1 text-slate-400">
                      <Battery className="w-3 h-3 text-emerald-400" /> Battery
                    </span>
                    <span className="font-telemetry text-slate-200">{Math.round(v.battery_level)}%</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1 text-slate-400">
                      <Navigation className="w-3 h-3 text-slate-400" /> Traveled
                    </span>
                    <span className="font-telemetry text-slate-200">{v.distance_traveled_km} km</span>
                  </div>
                </div>

                {/* Unified Console Action: Failover Simulation Button */}
                <div className="pt-2 border-t border-slate-800/80">
                  <button
                    onClick={() => onToggleBreakdown(v.id)}
                    className={`w-full py-1.5 px-3 rounded-lg text-xs font-display font-medium transition-all flex items-center justify-center gap-1.5 border ${
                      isBroken
                        ? 'bg-emerald-950/30 text-emerald-300 border-emerald-500/30 hover:bg-emerald-900/40'
                        : 'bg-slate-800/60 text-slate-300 border-slate-700/60 hover:bg-rose-950/30 hover:text-rose-300 hover:border-rose-500/30 active:scale-95'
                    }`}
                  >
                    {isBroken ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5" /> Recommission Vehicle
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3.5 h-3.5 text-slate-400" /> Simulate Breakdown
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          /* Orders Tab */
          <div className="space-y-2.5">
            <button
              onClick={() => setShowAddModal(true)}
              className="w-full py-2 px-3 rounded-lg bg-blue-600/15 border border-blue-500/30 hover:bg-blue-600/25 text-blue-300 font-display text-xs font-medium flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" /> Dispatch Priority Order
            </button>

            {pendingOrders.map((order) => {
              const prioTag =
                order.priority === 'urgent'
                  ? 'border-rose-500/30 bg-rose-950/20 text-rose-300'
                  : order.priority === 'high'
                  ? 'border-amber-500/30 bg-amber-950/20 text-amber-300'
                  : 'border-slate-800 bg-slate-900/50 text-slate-300';

              return (
                <div key={order.id} className={`p-3 rounded-lg border ${prioTag}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-display font-bold text-xs text-white">
                      {order.customer_name}
                    </span>
                    <span className="text-[10px] font-body capitalize px-1.5 py-0.5 rounded bg-black/30">
                      {order.priority}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-telemetry text-slate-400">
                    <span>{order.id}</span>
                    <span>{order.demand} pkg</span>
                  </div>
                  <div className="text-[10px] font-telemetry text-slate-400 mt-1">
                    Window: {Math.floor(order.time_window_start / 60)}:00 - {Math.floor(order.time_window_end / 60)}:00
                  </div>
                  {order.assigned_vehicle_id && (
                    <div className="text-[10px] font-body text-slate-400 mt-1">
                      Assigned to: <strong className="text-slate-200 font-medium">{order.assigned_vehicle_id}</strong>
                    </div>
                  )}
                </div>
              );
            })}

            {deliveredOrders.length > 0 && (
              <div className="pt-2">
                <h5 className="console-header mb-2">
                  Completed Deliveries ({deliveredOrders.length})
                </h5>
                <div className="space-y-1.5 opacity-60">
                  {deliveredOrders.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between p-2 rounded bg-slate-900/30 border border-slate-800 text-[11px] text-slate-400"
                    >
                      <span className="flex items-center gap-1.5 font-body">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> {d.customer_name}
                      </span>
                      <span className="text-emerald-400 font-medium text-[10px]">Fulfilled</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual Add Modal */}
      {showAddModal && (
        <div className="p-3.5 border-t border-slate-800 bg-slate-950/95">
          <form onSubmit={handleManualAdd} className="space-y-2.5">
            <h5 className="text-xs font-display font-semibold text-white">
              Dispatch Delivery Waypoint
            </h5>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-body text-slate-400 block mb-1">Package Count</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={newOrderDemand}
                  onChange={(e) => setNewOrderDemand(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs font-telemetry text-white outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-body text-slate-400 block mb-1">Priority</label>
                <select
                  value={newOrderPriority}
                  onChange={(e) => setNewOrderPriority(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-body text-white outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 py-1.5 bg-blue-600 text-white font-display text-xs font-semibold rounded-lg hover:bg-blue-500 transition-all active:scale-95 shadow-sm"
              >
                Dispatch
              </button>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 font-display text-xs rounded-lg hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </aside>
  );
};
