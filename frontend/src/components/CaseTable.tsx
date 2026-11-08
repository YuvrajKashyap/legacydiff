/** Show classic returns outputs and approved examples. Missing output is shown as missing. */
import type { ApprovedCase, ReturnOutput } from "../view-model";

export function Output({ value }: { value?: ReturnOutput }) {
  if (!value) return <span className="muted">No valid output</span>;
  return (
    <dl className="output-fields">
      <div>
        <dt>Eligible</dt>
        <dd>{value.eligible ? "Yes" : "No"}</dd>
      </div>
      <div>
        <dt>Refund</dt>
        <dd>
          {new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
          }).format(value.refund_cents / 100)}
        </dd>
      </div>
      <div>
        <dt>Reason</dt>
        <dd>
          <code>{value.reason}</code>
        </dd>
      </div>
    </dl>
  );
}

export function CaseTable({ cases }: { cases: ApprovedCase[] }) {
  return (
    <div className="table-scroll">
      <table className="case-table">
        <thead>
          <tr>
            <th>Reviewed case</th>
            <th>Receipt</th>
            <th>Final sale</th>
            <th>Eligible</th>
            <th>Refund cents</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((item) => (
            <tr key={item.id}>
              <th>
                {item.input.age_days} days <small>{item.id}</small>
              </th>
              <td>{item.input.has_receipt ? "Yes" : "No"}</td>
              <td>{item.input.final_sale ? "Yes" : "No"}</td>
              <td>{item.expected.eligible ? "Yes" : "No"}</td>
              <td>{item.expected.refund_cents}</td>
              <td>
                <code>{item.expected.reason}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
