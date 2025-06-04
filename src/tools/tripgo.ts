import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const TRIPGO_API_BASE_URL = "https://api.tripgo.com/v1";

export function registerTripGoTools(server: McpServer, env: any) {
  const TRIPGO_API_KEY = env.TRIPGO_API_KEY;

  // Check if API key is available
  if (!TRIPGO_API_KEY) {
    console.error(
      "TripGo API key is missing! Tools may not function correctly.",
    );
  }

  server.tool(
    "tripgo-routing",
    tripgoRoutingParams,
    tripgoRoutingTool.execute(TRIPGO_API_KEY),
  );

  server.tool(
    "tripgo-get-trip-url",
    tripgoSaveParams,
    tripgoSaveTool.execute(TRIPGO_API_KEY),
  );

  // server.tool("tripgo-locations", tripgoLocationsTool);
  // server.tool("tripgo-departures", tripgoDeparturesTool);
}

// Type definitions for the TripGo API responses
interface TripGoResponse {
  error?: string;
  errorMessage?: string;
}

interface RoutingResponse extends TripGoResponse {
  groups?: TripGroup[];
  segmentTemplates?: SegmentTemplate[];
}

interface LocationsResponse extends TripGoResponse {
  locations?: (
    | Location
    | StopLocation
    | BikePodLocation
    | CarParkLocation
    | CarPodLocation
    | CarRentalLocation
    | FreeFloatingVehicleLocation
  )[];
}

interface DeparturesResponse extends TripGoResponse {
  embarkationStops?: EmbarkationStop[];
  stops?: StopLocation[];
}

interface EmbarkationStop {
  stopCode: string;
  wheelchairAccessible?: boolean;
  services?: ServiceInfo[];
}

interface ServiceInfo {
  startTime: number;
  serviceTripID: string;
  serviceName?: string;
  serviceDirection?: string;
  serviceNumber?: string;
  serviceColor?: Color;
  serviceTextColor?: Color;
  routeID?: string;
  operatorID?: string;
  operator?: string;
  mode?: string;
  searchString?: string;
  modeInfo?: ModeInfo;
  wheelchairAccessible?: boolean;
  realTimeStatus?: string;
  realtimeVehicle?: RealtimeVehicle;
  realTimeDeparture?: number;
}

interface RealtimeVehicle {
  lastUpdate: number;
  id: string;
  label?: string;
  location?: Coordinate & { bearing?: number };
  occupancy?: string;
  wifi?: boolean;
  components?: Array<Array<VehicleComponent>>;
}

interface VehicleComponent {
  occupancy?: string;
  occupancyText?: string;
  wifi?: boolean;
  airConditioned?: boolean;
  wheelchairAccessible?: boolean;
  wheelchairSeats?: number;
  model?: string;
}

interface TripGroup {
  trips: Trip[];
}

interface Trip {
  arrive: number;
  depart: number;
  moneyCost?: number;
  currencySymbol?: string;
  caloriesCost?: number;
  carbonCost?: number;
  segments: SegmentReference[];
  weightedScore: number;
  saveURL?: string;
}

interface SegmentReference {
  segmentTemplateHashCode: number;
  startTime: number;
  endTime: number;
  realTime?: boolean;
  serviceTripID?: string;
  serviceDirection?: string;
  serviceNumber?: string;
  serviceName?: string;
  startPlatform?: string;
}

interface SegmentTemplate {
  hashCode: number;
  modeInfo: ModeInfo;
  type: string;
  from?: Location | StopLocation;
  to?: Location | StopLocation;
  isContinuation?: boolean;
  action?: string;
  notes?: string;
}

interface ModeInfo {
  identifier: string;
  alt: string;
  localIcon: string;
  color?: Color;
  remoteIcon?: string;
  operatorID?: string;
  operator?: OperatorInfo;
  route?: RouteInfo;
}

interface Color {
  red: number;
  green: number;
  blue: number;
}

interface Coordinate {
  lat: number;
  lng: number;
}

interface Location {
  lat: number;
  lng: number;
  address?: string;
  name?: string;
}

interface StopLocation extends Location {
  code?: string;
  timezone?: string;
  region?: string;
  shortName?: string;
  popularity?: number;
  types?: string[];
  services?: string[];
  wheelchairAccessible?: boolean;
  disruptionEffect?: string;
}

interface OperatorInfo {
  name: string;
  website?: string;
}

interface RouteInfo {
  name?: string;
  number?: string;
  color?: Color;
  textColor?: Color;
  type?: string;
  shortName?: string;
  agencyName?: string;
  agencyId?: string;
}

interface RealTimeAlert {
  title: string;
  text?: string;
  url?: string;
  serviceTripIDs?: string[];
  stopCodes?: string[];
  routes?: string[];
  startTime?: number;
  endTime?: number;
}

interface ServiceDeparture {
  realTime?: boolean;
  realTimeDeparture?: number;
  realTimeSource?: string;
  scheduledDeparture: number;
  scheduledArrival?: number;
  service: {
    id?: string;
    direction?: string;
    number?: string;
    name?: string;
    color?: Color;
    textColor?: Color;
    mode?: string;
    operatorID?: string;
    operator?: string;
  };
  stop?: StopLocation;
  platform?: string;
  notes?: string;
  alerts?: RealTimeAlert[];
}

interface RoutingQuery {
  from: Coordinate;
  to: Coordinate;
}

// Location subtypes
interface BikePodLocation extends StopLocation {}
interface CarParkLocation extends StopLocation {}
interface CarPodLocation extends StopLocation {}
interface CarRentalLocation extends StopLocation {}
interface FreeFloatingVehicleLocation extends StopLocation {}

// Helper function to format date for TripGo API
function formatDateForTripGo(isoDateString: string): number {
  const date = new Date(isoDateString);
  // TripGo API expects seconds since Unix epoch
  return Math.floor(date.getTime() / 1000);
}

async function handleRouting(
  key: string,
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  departureTime?: string,
  modes?: string[],
  maxWalkingTime?: number,
  wheelchair?: boolean,
  limit?: number,
): Promise<string> {
  const url = new URL(`${TRIPGO_API_BASE_URL}/routing.json`);

  // Required parameters
  url.searchParams.append(
    "from",
    `(${fromLat.toString()}, ${fromLng.toString()})`,
  );
  url.searchParams.append("to", `(${toLat.toString()}, ${toLng.toString()})`);

  // Optional parameters
  if (departureTime) {
    url.searchParams.append(
      "depart",
      formatDateForTripGo(departureTime).toString(),
    );
  }

  if (modes && modes.length > 0) {
    modes.forEach((mode) => url.searchParams.append("modes", mode));
    url.searchParams.append("allModes", "1");
  }

  // Configuration parameters
  url.searchParams.append("v", "11");

  if (maxWalkingTime) {
    url.searchParams.append("wm", maxWalkingTime.toString());
  }

  if (wheelchair !== undefined) {
    url.searchParams.append("wheelchair", wheelchair ? "1" : "0");
  }

  const response = await fetch(url.toString(), {
    headers: {
      "X-TripGo-Key": key,
    },
  });

  const data = (await response.json()) as RoutingResponse;

  if (data.error) {
    throw new Error(`Routing failed: ${data.error}`);
  }

  // For each trip group, take the two best scoring trips (lowest score is better)
  // and then return a maximum of `limit` trip groups
  const selectedGroups =
    data.groups
      ?.map((group) => {
        const sortedTrips = group.trips.sort(
          (a, b) => a.weightedScore - b.weightedScore,
        );
        return {
          trips: sortedTrips.slice(0, 2),
          score: sortedTrips[0].weightedScore,
        };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, limit) || [];

  const formattedTrips =
    selectedGroups.flatMap((group) =>
      group.trips.map((trip) => {
        const segments = trip.segments.map((segment) => {
          const template = data.segmentTemplates?.find(
            (t) => t.hashCode === segment.segmentTemplateHashCode,
          );
          return {
            mode: template?.modeInfo.alt || "Unknown Mode",
            duration: Math.floor((segment.endTime - segment.startTime) / 60),
            action: template?.action,
            serviceName: segment.serviceName,
            serviceNumber: segment.serviceNumber,
            from: template?.from?.address,
            to: template?.to?.address,
          };
        });

        return {
          depart: new Date(trip.depart * 1000).toISOString(),
          arrive: new Date(trip.arrive * 1000).toISOString(),
          totalDuration: Math.floor((trip.arrive - trip.depart) / 60),
          segments,
          cost: trip.moneyCost,
          currency: trip.currencySymbol,
          caloriesCost: trip.caloriesCost,
          carbonCost: trip.carbonCost,
          score: trip.weightedScore,
          url: trip.saveURL,
        };
      }),
    ) || [];

  return JSON.stringify(
    {
      trips: formattedTrips,
      query: {
        from: {
          lat: fromLat,
          lng: fromLng,
        },
        to: {
          lat: toLat,
          lng: toLng,
        },
      },
    },
    null,
    2,
  );
}

interface SaveTripResponse extends TripGoResponse {
  url: string;
}

async function handleSaveTrip(key: string, url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "X-TripGo-Key": key,
    },
  });

  const data = (await response.json()) as SaveTripResponse;

  if (data.error) {
    throw new Error(`Routing failed: ${data.error}`);
  }

  return JSON.stringify(
    {
      url: data.url,
    },
    null,
    2,
  );
}

async function handleLocationsSearch(
  lat: number,
  lng: number,
  radius?: number,
  modes?: string[],
): Promise<string> {
  const url = new URL(`${TRIPGO_API_BASE_URL}/locations.json`);

  // Required parameters
  url.searchParams.append("lat", lat.toString());
  url.searchParams.append("lng", lng.toString());

  // Optional parameters
  if (radius) {
    url.searchParams.append("radius", radius.toString());
  }

  if (modes && modes.length > 0) {
    url.searchParams.append("modes", modes.join(","));
  }

  const response = await fetch(url.toString(), {
    headers: {
      "X-TripGo-Key": TRIPGO_API_KEY,
    },
  });

  const data = (await response.json()) as LocationsResponse;

  // Check for error
  if (data.error) {
    throw new Error(`Locations search failed: ${data.error}`);
  }

  // Process and format the response for a cleaner output
  const formattedLocations = data.locations?.map((location) => {
    return {
      lat: location.lat,
      lng: location.lng,
      name: location.name || "",
      address: location.address || "",
      type: "StopLocation" in location ? "stop" : "location",
      code: "code" in location ? location.code : undefined,
      region: "region" in location ? location.region : undefined,
      services: "services" in location ? location.services : undefined,
    };
  });

  return JSON.stringify(
    {
      locations: formattedLocations,
      query: {
        lat,
        lng,
        radius,
      },
    },
    null,
    2,
  );
}

// Implementation of the departures function
async function handleDepartures(
  region: string,
  stopCodes: string[],
  timeStamp?: string,
  limit?: number,
): Promise<string> {
  const url = `${TRIPGO_API_BASE_URL}/departures.json`;

  // Prepare request body
  const requestBody: Record<string, any> = {
    region: region,
    embarkationStops: stopCodes,
  };

  // Optional parameters
  if (timeStamp) {
    requestBody.timeStamp = formatDateForTripGo(timeStamp);
  }

  if (limit) {
    requestBody.limit = limit;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-TripGo-Key": TRIPGO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const data = (await response.json()) as DeparturesResponse;

  // Check for error
  if (data.error) {
    throw new Error(`Departures search failed: ${data.error}`);
  }

  // Process and format the response for a cleaner output
  const formattedDepartures: any[] = [];

  // Process embarkationStops which contains the services (departures)
  data.embarkationStops?.forEach((embarkationStop) => {
    const stopCode = embarkationStop.stopCode;
    const stop = data.stops?.find((s) => s.code === stopCode);

    // Process each service in the embarkation stop
    embarkationStop.services?.forEach((service) => {
      formattedDepartures.push({
        stopCode: stopCode,
        stopName: stop?.name,
        scheduledDeparture: new Date(service.startTime * 1000).toISOString(),
        realTimeDeparture: service.realTimeDeparture
          ? new Date(service.realTimeDeparture * 1000).toISOString()
          : undefined,
        realTime: service.realTimeStatus === "IS_REAL_TIME",
        service: {
          id: service.serviceTripID,
          name: service.serviceName,
          number: service.serviceNumber,
          direction: service.serviceDirection,
          operator: service.operator,
          operatorID: service.operatorID,
          mode: service.mode,
          routeID: service.routeID,
          color: service.serviceColor,
          textColor: service.serviceTextColor,
        },
        wheelchairAccessible: service.wheelchairAccessible,
        vehicle: service.realtimeVehicle
          ? {
              id: service.realtimeVehicle.id,
              label: service.realtimeVehicle.label,
              lastUpdate: new Date(
                service.realtimeVehicle.lastUpdate * 1000,
              ).toISOString(),
              location: service.realtimeVehicle.location,
              occupancy: service.realtimeVehicle.occupancy,
              wifi: service.realtimeVehicle.wifi,
            }
          : undefined,
      });
    });
  });

  return JSON.stringify(
    {
      departures: formattedDepartures,
      stops: data.stops,
      query: {
        region,
        stopCodes,
      },
    },
    null,
    2,
  );
}

const tripgoRoutingParams = {
  fromLat: z.number().describe("Latitude of the origin location"),
  fromLng: z.number().describe("Longitude of the origin location"),
  toLat: z.number().describe("Latitude of the destination location"),
  toLng: z.number().describe("Longitude of the destination location"),
  departureTime: z
    .string()
    .optional()
    .describe("ISO datetime string for departure time"),
  modes: z
    .array(z.enum(["pt_pub", "cy_bic", "me_car", "ps_tax", "wa_wal"]))
    .optional()
    .describe("Transportation modes to include."),
  maxWalkingTime: z
    .number()
    .optional()
    .describe("Maximum walking time in minutes"),
  wheelchair: z
    .boolean()
    .optional()
    .describe("Whether to include wheelchair accessible options"),
  limit: z
    .number()
    .optional()
    .default(3)
    .describe("Maximum number of results to return"),
};

const tripgoRoutingTool = {
  name: "tripgo_routing",
  description:
    "Plan a trip between two locations with various transportation modes",
  parameters: z.object(tripgoRoutingParams),
  execute: (key: string) => async (params: any) => {
    try {
      const result = await handleRouting(
        key,
        params.fromLat,
        params.fromLng,
        params.toLat,
        params.toLng,
        params.departureTime,
        params.modes,
        params.maxWalkingTime,
        params.wheelchair,
        params.limit,
      );
      return {
        content: [{ type: "text" as const, text: String(result) }],
        structuredContent: JSON.parse(result),
      };
    } catch (error) {
      throw new Error(
        `Error in tripgo_routing: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

const tripgoSaveParams = {
  tripURL: z
    .string()
    .url()
    .describe(
      "URL of the trip to fetch as previously returned by tripgo_routing",
    ),
};

const tripgoSaveTool = {
  name: "tripgo_save",
  description:
    "Retrieves a persistent URL of a trip returned by tripgo_routing, which can be opened in a web browser.",
  parameters: z.object(tripgoSaveParams),
  execute: (key: string) => async (params: any) => {
    try {
      const result = await handleSaveTrip(key, params.tripURL);
      return {
        content: [{ type: "text" as const, text: String(result) }],
        structuredContent: JSON.parse(result),
      };
    } catch (error) {
      throw new Error(
        `Error in tripgo_save: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

const tripgoLocationsTool = {
  name: "tripgo_locations",
  description: "Search for locations near a specified point",
  parameters: z.object({
    lat: z.number().describe("Latitude of the search center"),
    lng: z.number().describe("Longitude of the search center"),
    radius: z.number().optional().describe("Search radius in meters"),
    modes: z
      .array(z.string())
      .optional()
      .describe("Transportation modes to include in results"),
  }),
  execute: async (params: any) => {
    try {
      return await handleLocationsSearch(
        params.lat,
        params.lng,
        params.radius,
        params.modes,
      );
    } catch (error) {
      throw new Error(
        `Error in tripgo_locations: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

const tripgoDeparturesTool = {
  name: "tripgo_departures",
  description: "Get departures from a list of stops",
  parameters: z.object({
    region: z.string().describe("Region code for the transit system"),
    stopCodes: z
      .array(z.string())
      .describe("List of stop codes to get departures for"),
    timeStamp: z
      .string()
      .optional()
      .describe("ISO datetime string for departure time"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of departures to return"),
  }),
  execute: async (params: any) => {
    try {
      return await handleDepartures(
        params.region,
        params.stopCodes,
        params.timeStamp,
        params.limit,
      );
    } catch (error) {
      throw new Error(
        `Error in tripgo_departures: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};
