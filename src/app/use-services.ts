import { useContext } from "react";
import type { Services } from "./container";
import { ServicesContext } from "./services-context";

/** Access the application services from any component. */
export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error("useServices must be used inside <ServicesProvider>");
  return services;
}
