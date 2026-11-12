import { REPO_URL } from '../mode';
import { PrivacyNotice } from '../components/PrivacyNotice';

export function HelpPage() {
  return (
    <article className="help">
      <h1>Help / Get Local Version</h1>
      <PrivacyNotice />
      <p>This viewer is stateless: it keeps no copy of your files once the page is refreshed or closed. While the page is open, the data lives only in this tab's memory.</p>
      <p>
        <a href={`${REPO_URL}#local-app`}>Want saved history? Run Local App</a>
      </p>

      <h2>What the CSV columns mean</h2>
      <p>Each row is one shot from a FlightScope Mevo export. Ball columns (speed, launch angle, spin, carry, total, lateral landing) describe the ball. Club columns (club speed, attack angle, path, face angle, dynamic loft, low point, impact location) describe the club at impact. A blank, "-" or "N/A" cell is shown as "Not measured", never as zero. "Time (s)" is ball flight duration, not a timestamp.</p>

      <h2>Impact sign convention</h2>
      <ul>
        <li>Lateral impact: + toe, − heel, 0 centered.</li>
        <li>Vertical impact: + high.</li>
        <li>Face impact is shown in inches, as the CSV reports it. The face is drawn face-on: for a right-handed golfer the toe is on the left.</li>
      </ul>

      <h2>Dispersion modes</h2>
      <table className="help__table">
        <thead>
          <tr><th>Mode</th><th>X</th><th>Y</th><th>Panel title</th><th>Note</th></tr>
        </thead>
        <tbody>
          <tr><td>Carry</td><td>Lateral landing</td><td>Carry distance</td><td>Landing dispersion · top view</td><td>Actual reported landing position</td></tr>
          <tr><td>Total</td><td>Lateral landing</td><td>Total distance</td><td>Total Distance vs. Landing Offset</td><td>Hybrid plot, not actual resting position</td></tr>
        </tbody>
      </table>

      <h2>3D replay</h2>
      <p>The 3D replay is illustrative. It is drawn from impact measurements, and the club trajectory is inferred. It is not captured swing motion.</p>
    </article>
  );
}
