import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";

/** Shows the most recent triggered alert as a dismissible toast. */
export function AlertToaster() {
  const { alerts } = useServices();
  const events = useStore(alerts.events);
  const latest = events[0];

  if (!latest) return null;

  return (
    <Snackbar
      key={latest.alert.id}
      open
      autoHideDuration={8000}
      onClose={() => alerts.dismissEvent(latest.alert.id)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert severity="warning" variant="filled" onClose={() => alerts.dismissEvent(latest.alert.id)}>
        {latest.message}
      </Alert>
    </Snackbar>
  );
}
