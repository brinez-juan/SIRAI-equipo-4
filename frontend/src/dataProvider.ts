import { fetchUtils } from "react-admin";
import jsonServerProvider from "ra-data-json-server";

const fetchJsonUtil = (url: string, options: fetchUtils.Options = {}) => {
  if (!options.headers) {
    options.headers = new Headers({ Accept: "application/json" });
  }
  (options.headers as Headers).set(
    "Authentication",
    sessionStorage.getItem("auth") ?? "",
  );
  return fetchUtils.fetchJson(url, options);
};

export const dataProvider = jsonServerProvider(
  import.meta.env.VITE_BACKEND,
  fetchJsonUtil,
);
