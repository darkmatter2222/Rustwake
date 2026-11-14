/**
 * RW3D #147 (T20): the road-jobs section of the Routes destination.
 *
 * Dispatch policy (material filter, reserve floor, minimum fill) gates JOB
 * CREATION only — the engine keeps authority over stock, room and carriers.
 * Jobs render with cargo, destination, the TYPED wait reason and a Focus face
 * (U06); recovery hints name the fix for unreachable destinations and occupied
 * bays without ever resetting the yard. Bay capacity keys on the #139 declared
 * loading sockets' approach cells — the exact cells the traffic authority
 * leases — so there is no parallel bay model.
 *
 * Session-only: nothing here touches SAVE_KEY, migration or recovery (#148).
 */
import { memo, useState, useSyncExternalStore } from "react";
import type { Cell } from "../../game/world/types";
import type { ResourceId } from "../../game/content/defs";
import { ROAD_ROUTES_COPY as COPY } from "./copy";
import {
  ALL_RESOURCES,
  checkDispatchPolicy,
  getDispatchPolicy,
  policyRejectionText,
  setMinFill,
  setReserveFloor,
  subscribeDispatchPolicy,
  togglePolicyResource,
} from "./dispatchPolicy";
import {
  bayRows,
  cancelRejectionText,
  cellLabel,
  freeRoom,
  jobRows,
  rejectionText,
  waitReasonFocusCell,
  waitReasonRecovery,
  waitReasonText,
  type BayRow,
  type RoadLogisticsApi,
} from "./fleetModel";
import { useRoadLogistics } from "./useRoadLogistics";

/** Session-unique command ids; creation is idempotent by id (engine contract). */
let jobCommandSeq = 0;

/** One declared bay: occupancy, current cap, and a writer-gated cap editor. */
function BayCapacityRow(props: {
  bay: BayRow;
  locked: boolean;
  onSet: (cell: Cell, capacity: number) => boolean;
}) {
  const { bay } = props;
  const [draft, setDraft] = useState(bay.capacity === null ? "" : String(bay.capacity));
  const [refused, setRefused] = useState(false);
  return (
    <li className="shell-list__item">
      <span className="shell-list__label">
        {bay.label} · {cellLabel(bay.cell)}
        <span className="status-line">
          {bay.leases} {COPY.bayOccupancy} ·{" "}
          {bay.capacity === null ? COPY.bayUnlimited : `${COPY.bayCapacity} ${bay.capacity}`}
          {bay.connected ? "" : ` · ${COPY.disconnected}`}
        </span>
      </span>
      <form
        className="road-form road-form--inline"
        aria-label={`${COPY.bayCapacity} ${bay.label}`}
        onSubmit={(event) => {
          event.preventDefault();
          const capacity = Number(draft);
          setRefused(!props.onSet(bay.cell, capacity));
        }}
      >
        <input
          type="number"
          min={1}
          step={1}
          value={draft}
          disabled={props.locked}
          aria-label={`${COPY.bayCapacity} ${bay.label}`}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="icon-btn" type="submit" disabled={props.locked}>
          {COPY.baySet}
        </button>
        {refused ? (
          <span className="status-line" role="note">
            {COPY.refused}
          </span>
        ) : null}
      </form>
    </li>
  );
}

export const RoadRoutes = memo(function RoadRoutes(props: {
  api: RoadLogisticsApi;
  onFocusCell: (cell: Cell) => void;
}) {
  const { api, onFocusCell } = props;
  const { logistics, traffic, locked, sockets } = useRoadLogistics(api);
  const policy = useSyncExternalStore(subscribeDispatchPolicy, getDispatchPolicy);
  const buildings = Object.values(logistics.buildings).sort((a, b) => a.id - b.id);
  const rows = jobRows(logistics, traffic);
  const bays = bayRows(traffic, sockets);

  const [source, setSource] = useState("");
  const [dest, setDest] = useState("");
  const [resource, setResource] = useState<ResourceId>("scrap");
  const [amount, setAmount] = useState("1");
  const [priority, setPriority] = useState("0");
  const [message, setMessage] = useState<string | null>(null);
  const [setupId, setSetupId] = useState("1");
  const [setupX, setSetupX] = useState("0");
  const [setupY, setSetupY] = useState("0");
  const [setupCapacity, setSetupCapacity] = useState("20");
  const [setupMessage, setSetupMessage] = useState<string | null>(null);

  const sourceId = buildings.some((b) => String(b.id) === source)
    ? Number(source)
    : (buildings[0]?.id ?? 0);
  const destId = buildings.some((b) => String(b.id) === dest)
    ? Number(dest)
    : (buildings[1]?.id ?? buildings[0]?.id ?? 0);

  return (
    <section className="road-routes" aria-label={COPY.title}>
      <h3 className="panel__subtitle">{COPY.title}</h3>
      <p className="status-line">{COPY.lead}</p>
      {locked ? (
        <p className="status-line" role="note">
          {COPY.reader}
        </p>
      ) : null}

      <section className="road-policy" aria-label={COPY.policy}>
        <span className="road-form__title">{COPY.policy}</span>
        <p className="status-line">{COPY.policyNote}</p>
        <fieldset className="road-policy__filters">
          <legend>{COPY.materialFilter}</legend>
          {ALL_RESOURCES.map((r) => (
            <label key={r} className="road-policy__filter">
              <input
                type="checkbox"
                checked={policy.allowedResources === null || policy.allowedResources.includes(r)}
                disabled={locked}
                onChange={() => togglePolicyResource(r)}
              />
              {r}
            </label>
          ))}
        </fieldset>
        <div className="road-form road-form--inline">
          <label>
            {COPY.reserveFloor}
            <input
              type="number"
              min={0}
              step={1}
              value={String(policy.reserveFloor)}
              disabled={locked}
              onChange={(e) => {
                const floor = Number(e.target.value);
                if (Number.isInteger(floor) && floor >= 0) setReserveFloor(floor);
              }}
            />
          </label>
          <label>
            {COPY.minFill}
            <input
              type="number"
              min={1}
              step={1}
              value={String(policy.minFill)}
              disabled={locked}
              onChange={(e) => {
                const fill = Number(e.target.value);
                if (Number.isInteger(fill) && fill >= 1) setMinFill(fill);
              }}
            />
          </label>
        </div>
      </section>

      <form
        className="road-form"
        aria-label={COPY.newJob}
        onSubmit={(event) => {
          event.preventDefault();
          const qty = Number(amount);
          const prio = Number(priority);
          const request = {
            id: `ui-147-job-${++jobCommandSeq}`,
            sourceBuildingId: sourceId,
            destBuildingId: destId,
            cargoType: resource,
            amount: qty,
            priority: prio,
          };
          const rejected = checkDispatchPolicy(policy, request, logistics);
          if (rejected !== null) {
            setMessage(policyRejectionText(rejected));
            return;
          }
          const result = api.createLogisticsJob(request);
          setMessage(result.ok ? COPY.created : rejectionText(result));
        }}
      >
        <span className="road-form__title">{COPY.newJob}</span>
        {buildings.length === 0 ? (
          <p className="status-line" role="note">
            {COPY.noBuildings}
          </p>
        ) : null}
        <label>
          {COPY.source}
          <select value={String(sourceId)} disabled={locked} onChange={(e) => setSource(e.target.value)}>
            {buildings.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.id} · {cellLabel(b.cell)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {COPY.destination}
          <select value={String(destId)} disabled={locked} onChange={(e) => setDest(e.target.value)}>
            {buildings.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.id} · {cellLabel(b.cell)} · room {freeRoom(logistics, b)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {COPY.material}
          <select value={resource} disabled={locked} onChange={(e) => setResource(e.target.value as ResourceId)}>
            {ALL_RESOURCES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label>
          {COPY.amount}
          <input type="number" min={1} step={1} value={amount} disabled={locked} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          {COPY.priority}
          <input type="number" step={1} value={priority} disabled={locked} onChange={(e) => setPriority(e.target.value)} />
        </label>
        <button className="icon-btn" type="submit" disabled={locked || buildings.length === 0}>
          {COPY.create}
        </button>
        {message !== null ? (
          <p className="status-line" role="note">
            {message}
          </p>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <p className="status-line">{COPY.emptyJobs}</p>
      ) : (
        <ul className="shell-list">
          {rows.map(({ job, wait }) => {
            const terminal = job.status === "complete" || job.status === "cancelled";
            return (
              <li key={job.id} className="shell-list__item road-routes__job">
                <button
                  type="button"
                  className="shell-list__label road-fleet__select"
                  aria-label={`${COPY.focus} job ${job.id}`}
                  onClick={() => onFocusCell(job.sourceCell)}
                >
                  {COPY.job} {job.id} · {job.status}/{job.phase}
                  <span className="status-line">
                    {job.delivered}/{job.amount} {job.cargoType} · {job.sourceBuildingId} → {job.destBuildingId}{" "}
                    {cellLabel(job.destCell)}
                    {job.carrierId !== null ? ` · truck ${job.carrierId}` : ""}
                  </span>
                </button>
                {wait !== null ? (
                  <span className="status-line road-fleet__hold" role="note">
                    {waitReasonText(wait)}
                    <span className="status-line">{waitReasonRecovery(wait)}</span>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`${COPY.focus} job ${job.id} blocker`}
                      onClick={() => onFocusCell(waitReasonFocusCell(wait, job))}
                    >
                      {COPY.focus}
                    </button>
                  </span>
                ) : null}
                {!terminal ? (
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={locked}
                    aria-label={`${COPY.cancel} job ${job.id}`}
                    onClick={() => {
                      const result = api.cancelLogisticsJob(job.id);
                      if (!result.ok) setMessage(cancelRejectionText(result));
                    }}
                  >
                    {COPY.cancel}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <section className="road-bays" aria-label={COPY.bays}>
        <span className="road-form__title">{COPY.bays}</span>
        {bays.length === 0 ? (
          <p className="status-line">{COPY.baysEmpty}</p>
        ) : (
          <ul className="shell-list">
            {bays.map((bay) => (
              <BayCapacityRow
                key={cellLabel(bay.cell)}
                bay={bay}
                locked={locked}
                onSet={(cell, capacity) => api.setTrafficBayCapacity(cell, capacity)}
              />
            ))}
          </ul>
        )}
      </section>

      <form
        className="road-form"
        aria-label={COPY.registerBuilding}
        onSubmit={(event) => {
          event.preventDefault();
          const id = Number(setupId);
          const x = Number(setupX);
          const y = Number(setupY);
          const cap = Number(setupCapacity);
          const ok =
            Number.isInteger(id) && Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(cap)
              ? api.registerLogisticsBuilding({ id, cell: { x, y }, capacity: cap })
              : false;
          setSetupMessage(ok ? COPY.registered : COPY.registerRefused);
        }}
      >
        <span className="road-form__title">{COPY.setup}</span>
        <p className="status-line">{COPY.setupNote}</p>
        <label>
          {COPY.buildingId}
          <input type="number" min={1} step={1} value={setupId} disabled={locked} onChange={(e) => setSetupId(e.target.value)} />
        </label>
        <label>
          {COPY.cellX}
          <input type="number" step={1} value={setupX} disabled={locked} onChange={(e) => setSetupX(e.target.value)} />
        </label>
        <label>
          {COPY.cellY}
          <input type="number" step={1} value={setupY} disabled={locked} onChange={(e) => setSetupY(e.target.value)} />
        </label>
        <label>
          {COPY.buildingCapacity}
          <input type="number" min={1} step={1} value={setupCapacity} disabled={locked} onChange={(e) => setSetupCapacity(e.target.value)} />
        </label>
        <button className="icon-btn" type="submit" disabled={locked}>
          {COPY.registerBuilding}
        </button>
        {setupMessage !== null ? (
          <p className="status-line" role="note">
            {setupMessage}
          </p>
        ) : null}
      </form>
    </section>
  );
});
