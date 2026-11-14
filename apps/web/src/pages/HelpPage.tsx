import { REPO_URL } from '../mode';
import { PrivacyNotice } from '../components/PrivacyNotice';

export function HelpPage() {
  const local = import.meta.env.VITE_APP_MODE === 'local';
  return (
    <article className="help">
      <h1>{local ? 'Help' : 'Help / Get Local Version'}</h1>
      {local ? (
        <p>Your sessions and the original CSV files are saved on this computer in the MyGolfViz data folder.</p>
      ) : (
        <>
          <PrivacyNotice />
          <p>This viewer is stateless: it keeps no copy of your files once the page is refreshed or closed. While the page is open, the data lives only in this tab's memory.</p>
          <section className="help__local" aria-labelledby="help-local">
            <h2 id="help-local">Get the local version</h2>
            <p>The local version keeps your sessions. It runs on your own computer, saves every session there, and never uploads anything.</p>
            <ul>
              <li><strong>A session library:</strong> every session you have loaded, as a list or on a calendar.</li>
              <li><strong>Sessions you can come back to:</strong> name, date, notes, excluded shots and file order are all saved.</li>
              <li><strong>Progression:</strong> one club across your sessions (carry, dispersion, spin, strike and more), with target ranges.</li>
              <li><strong>The same Overview and Shot Inspector</strong> you use here.</li>
            </ul>
            <div className="help__ways">
              <div className="help__way">
                <h3>Mac app</h3>
                <p>For Apple Silicon Macs. MyGolfViz in its own window. You build it once with one command (that needs Node and uv), then open it like any other app.</p>
                <a href={`${REPO_URL}#mac-app`}>How to build the Mac app</a>
              </div>
              <div className="help__way">
                <h3>In your browser</h3>
                <p>Start it from a terminal with <code>npm run local</code> and open the link it prints. Needs Node and uv.</p>
                <a href={`${REPO_URL}#local-app`}>How to run it in your browser</a>
              </div>
            </div>
          </section>
        </>
      )}

      <h2>What the CSV columns mean</h2>
      <p>Each row is one shot from a FlightScope Mevo export. Ball columns (speed, launch angle, spin, carry, total, lateral landing) describe the ball. Club columns (club speed, attack angle, path, face angle, dynamic loft, low point, impact location) describe the club at impact. A blank, "-" or "N/A" cell means the value was not measured: the app shows it as a dash (–), never as zero, and hovering the dash or using a screen reader gives "Not measured". "Time (s)" is ball flight duration, not a timestamp.</p>

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
