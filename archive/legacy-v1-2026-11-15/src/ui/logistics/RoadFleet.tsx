/**
 * RW3D #147 (T20): the road-fleet section of the Fleet destination.
 *
 * Reads the session-only logistics/traffic slices through the existing store
 * capability (no new store surface, no save writes) and renders one row per
 * truck: job, cargo/capacity, destination, and the TYPED wait reason with a
 * Focus face that pans the yard camera to the exact contested cell (U06).
 * Traffic stays opt-in and default-OFF (#141 ruling): until the writer enables
 * it, the engine runs the legacy one-cell-per-tick path untouched.
 *
 * The production store -> fleet-frame publish feed is #148's cutover; this
 * panel reads the authority directly and never fakes a live feed.
 */
import { memo, useState } from "react";
import type { Cell } from "../../game/world/types";
import type { TruckConfig } from "../../game/simulation/traffic";
import { ROAD_FLEET_COPY as COPY } from "./copy";
import {
  cellLabel,
  fleetRows,
  waitReasonFocusCell,
  waitReasonRecovery,
  waitReasonText,
  type FleetRow,
  type RoadLogisticsApi,
} from "./fleetModel";
import { useRoadLogistics } from "./useRoadLogistics";

function parseTruckConfig(speed: string, load: string, unload: string): Partial<TruckConfig> | null {
  const s = Number(speed);
  const l = Number(load);
  const u = Number(unload);
  if (!Number.isInteger(s) || !Number.isInteger(l) || !Number.isInteger(u)) return null;
  return { speed: s, loadTicks: l, unloadTicks: u };
}

/** One truck-profile editor (default or per-truck). Local draft, engine validates. */
const ProfileForm = memo(function ProfileForm(props: {
  label: string;
  initial: TruckConfig;
  disabled: boolean;
  onApply: (config: Partial<TruckConfig>) => boolean;
}) {
  const [speed, setSpeed] = useState(String(props.initial.speed));
  const [load, setLoad] = useState(String(props.initial.loadTicks));
  const [unload, setUnload] = useState(String(props.initial.unloadTicks));
  const [refused, setRefused] = useState(false);
  return (
    <form
      className="road-form"
      aria-label={props.label}
      onSubmit={(event) => {
        event.preventDefault();
        const config = parseTruckConfig(speed, load, unload);
        const ok = config !== null && props.onApply(config);
        setRefused(!ok);
      }}
    >
      <span className="road-form__title">{props.label}</span>
      <label>
        {COPY.speed}
        <input
          type="number"
          min={1}
          step={1}
          value={speed}
          disabled={props.disabled}
          onChange={(e) => setSpeed(e.target.value)}
        />
      </label>
      <label>
        {COPY.loadTicks}
        <input
          type="number"
          min={0}
          step={1}
          value={load}
          disabled={props.disabled}
          onChange={(e) => setLoad(e.target.value)}
        />
      </label>
      <label>
        {COPY.unloadTicks}
        <input
          type="number"
          min={0}
          step={1}
          value={unload}
          disabled={props.disabled}
          onChange={(e) => setUnload(e.target.value)}
        />
      </label>
      <button className="icon-btn" type="submit" disabled={props.disabled}>
        {COPY.apply}
      </button>
      {refused ? (
        <p className="status-line" role="note">
          {COPY.refused}
        </p>
      ) : null}
    </form>
  );
});

/** One truck row: identity, job, cargo, destination, typed hold + focus. */
function FleetRowItem(props: {
  row: FleetRow;
  selected: boolean;
  locked: boolean;
  onSelect: (carrierId: number, cell: Cell) => void;
  onFocusCell: (cell: Cell) => void;
  onConfigure: (carrierId: number, config: Partial<TruckConfig>) => boolean;
}) {
  const { row } = props;
  const { carrier, job, runtime } = row;
  const cargo = job === null ? `0/${carrier.capacity}` : `${job.inTransit}/${carrier.capacity} ${job.cargoType}`;
  const destination = job === null ? "—" : `${job.destBuildingId} ${cellLabel(job.destCell)}`;
  const status = job === null ? COPY.idle : `${COPY.job} ${job.id} · ${job.phase}`;
  return (
    <li className={`shell-list__item road-fleet__row${props.selected ? " road-fleet__row--selected" : ""}`}>
      <button
        type="button"
        className="shell-list__label road-fleet__select"
        aria-label={`${COPY.select} ${carrier.id}`}
        aria-pressed={props.selected}
        onClick={() => props.onSelect(carrier.id, carrier.cell)}
      >
        Truck {carrier.id}
        <span className="status-line">
          {status} · {COPY.cargo} {cargo} · {COPY.destination} {destination}
        </span>
        {runtime !== null && runtime.retryCount > 0 ? (
          <span className="status-line">
            retry {runtime.retryCount} · backoff until {runtime.backoffUntil}
          </span>
        ) : null}
      </button>
      {row.wait !== null ? (
        <span className="status-line road-fleet__hold" role="note">
          {waitReasonText(row.wait)}
          <span className="status-line">{waitReasonRecovery(row.wait)}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label={`${COPY.focus} truck ${carrier.id}`}
            onClick={() =>
              props.onFocusCell(
                job === null ? row.cell : waitReasonFocusCell(row.wait!, job),
              )
            }
          >
            {COPY.focus}
          </button>
        </span>
      ) : null}
      {props.selected ? (
        <ProfileForm
          key={`${row.config.speed}-${row.config.loadTicks}-${row.config.unloadTicks}`}
          label={`${COPY.truckConfig} ${carrier.id}`}
          initial={row.config}
          disabled={props.locked}
          onApply={(config) => props.onConfigure(carrier.id, config)}
        />
      ) : null}
    </li>
  );
}

export const RoadFleet = memo(function RoadFleet(props: {
  api: RoadLogisticsApi;
  onFocusCell: (cell: Cell) => void;
}) {
  const { api, onFocusCell } = props;
  const { logistics, traffic, trafficEnabled, locked } = useRoadLogistics(api);
  const rows = fleetRows(logistics, traffic);
  const [selected, setSelected] = useState<number | null>(null);
  const [capacity, setCapacity] = useState("12");
  const [addX, setAddX] = useState("0");
  const [addY, setAddY] = useState("0");
  const [addMessage, setAddMessage] = useState<string | null>(null);
  const [junctionCapacity, setJunctionCapacity] = useState(
    traffic.junctionCapacity === null ? "" : String(traffic.junctionCapacity),
  );
  const [junctionCost, setJunctionCost] = useState(String(traffic.junctionCost));
  const [junctionRefused, setJunctionRefused] = useState(false);
  const [maxRetries, setMaxRetries] = useState(String(traffic.maxRetries));
  const [baseBackoff, setBaseBackoff] = useState(String(traffic.baseBackoff));
  const [maxBackoff, setMaxBackoff] = useState(String(traffic.maxBackoff));
  const [retryRefused, setRetryRefused] = useState(false);

  return (
    <section className="road-fleet" aria-label={COPY.title}>
      <h3 className="panel__subtitle">{COPY.title}</h3>
      <p className="status-line">{COPY.lead}</p>
      {locked ? (
        <p className="status-line" role="note">
          {COPY.reader}
        </p>
      ) : null}
      <p className="status-line" role="status">
        {trafficEnabled ? COPY.trafficOn : COPY.trafficOff}
      </p>
      {!trafficEnabled ? (
        <button
          type="button"
          className="icon-btn"
          disabled={locked}
          onClick={() => api.enableTraffic()}
        >
          {COPY.enable}
        </button>
      ) : null}

      {rows.length === 0 ? (
        <p className="status-line">{COPY.empty}</p>
      ) : (
        <ul className="shell-list">
          {rows.map((row) => (
            <FleetRowItem
              key={row.carrier.id}
              row={row}
              selected={selected === row.carrier.id}
              locked={locked}
              onSelect={(carrierId, cell) => {
                setSelected(carrierId);
                onFocusCell(cell);
              }}
              onFocusCell={onFocusCell}
              onConfigure={(carrierId, config) => api.configureTrafficTruck(carrierId, config)}
            />
          ))}
        </ul>
      )}

      <form
        className="road-form"
        aria-label={COPY.addTruck}
        onSubmit={(event) => {
          event.preventDefault();
          const cap = Number(capacity);
          const x = Number(addX);
          const y = Number(addY);
          const carrier =
            Number.isInteger(cap) && Number.isInteger(x) && Number.isInteger(y)
              ? api.registerLogisticsCarrier({ capacity: cap, cell: { x, y } })
              : null;
          setAddMessage(carrier === null ? COPY.addRefused : COPY.added);
        }}
      >
        <span className="road-form__title">{COPY.addTruck}</span>
        <label>
          {COPY.capacity}
          <input type="number" min={1} step={1} value={capacity} disabled={locked} onChange={(e) => setCapacity(e.target.value)} />
        </label>
        <label>
          {COPY.cellX}
          <input type="number" step={1} value={addX} disabled={locked} onChange={(e) => setAddX(e.target.value)} />
        </label>
        <label>
          {COPY.cellY}
          <input type="number" step={1} value={addY} disabled={locked} onChange={(e) => setAddY(e.target.value)} />
        </label>
        <button className="icon-btn" type="submit" disabled={locked}>
          {COPY.addTruck}
        </button>
        {addMessage !== null ? (
          <p className="status-line" role="note">
            {addMessage}
          </p>
        ) : null}
      </form>

      <ProfileForm
        key={`default-${traffic.defaultTruck.speed}-${traffic.defaultTruck.loadTicks}-${traffic.defaultTruck.unloadTicks}`}
        label={COPY.defaultConfig}
        initial={traffic.defaultTruck}
        disabled={locked || !trafficEnabled}
        onApply={(config) => api.setTrafficDefaultTruck(config)}
      />

      <form
        className="road-form"
        aria-label={COPY.junction}
        onSubmit={(event) => {
          event.preventDefault();
          const cap = junctionCapacity.trim() === "" ? null : Number(junctionCapacity);
          const cost = Number(junctionCost);
          const okCap = api.setTrafficJunctionCapacity(cap);
          const okCost = api.setTrafficJunctionCost(cost);
          setJunctionRefused(!(okCap && okCost));
        }}
      >
        <span className="road-form__title">{COPY.junction}</span>
        <label>
          {COPY.junctionCapacity}
          <input type="number" min={1} step={1} value={junctionCapacity} disabled={locked || !trafficEnabled} onChange={(e) => setJunctionCapacity(e.target.value)} />
        </label>
        <label>
          {COPY.junctionCost}
          <input type="number" min={0} step={1} value={junctionCost} disabled={locked || !trafficEnabled} onChange={(e) => setJunctionCost(e.target.value)} />
        </label>
        <button className="icon-btn" type="submit" disabled={locked || !trafficEnabled}>
          {COPY.apply}
        </button>
        {junctionRefused ? (
          <p className="status-line" role="note">
            {COPY.refused}
          </p>
        ) : null}
      </form>

      <form
        className="road-form"
        aria-label={COPY.retry}
        onSubmit={(event) => {
          event.preventDefault();
          const ok = api.setTrafficRetryPolicy({
            maxRetries: Number(maxRetries),
            baseBackoff: Number(baseBackoff),
            maxBackoff: Number(maxBackoff),
          });
          setRetryRefused(!ok);
        }}
      >
        <span className="road-form__title">{COPY.retry}</span>
        <label>
          {COPY.maxRetries}
          <input type="number" min={0} step={1} value={maxRetries} disabled={locked || !trafficEnabled} onChange={(e) => setMaxRetries(e.target.value)} />
        </label>
        <label>
          {COPY.baseBackoff}
          <input type="number" min={1} step={1} value={baseBackoff} disabled={locked || !trafficEnabled} onChange={(e) => setBaseBackoff(e.target.value)} />
        </label>
        <label>
          {COPY.maxBackoff}
          <input type="number" min={1} step={1} value={maxBackoff} disabled={locked || !trafficEnabled} onChange={(e) => setMaxBackoff(e.target.value)} />
        </label>
        <button className="icon-btn" type="submit" disabled={locked || !trafficEnabled}>
          {COPY.apply}
        </button>
        {retryRefused ? (
          <p className="status-line" role="note">
            {COPY.refused}
          </p>
        ) : null}
      </form>
    </section>
  );
});
