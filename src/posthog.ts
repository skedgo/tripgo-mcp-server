import { PostHog } from "posthog-node";

export type PostHogEnv = {
	POSTHOG_API_KEY?: string;
	POSTHOG_HOST?: string;
};

const clients = new Map<string, PostHog>();

function warnMissingConfig(variable: keyof PostHogEnv): void {
	console.warn(
		`${variable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variable} is configured`,
	);
}

export function getPostHog(env: PostHogEnv): PostHog | undefined {
	const apiKey = env.POSTHOG_API_KEY?.trim();
	if (!apiKey) {
		warnMissingConfig("POSTHOG_API_KEY");
		return undefined;
	}

	const host = env.POSTHOG_HOST?.trim();
	if (!host) {
		warnMissingConfig("POSTHOG_HOST");
		return undefined;
	}

	const clientKey = `${apiKey}:${host}`;
	let client = clients.get(clientKey);
	if (!client) {
		client = new PostHog(apiKey, {
			host,
			enableExceptionAutocapture: true,
			flushAt: 1,
			flushInterval: 0,
			requestTimeout: 2000,
			fetchRetryCount: 0,
		});
		clients.set(clientKey, client);
	}

	return client;
}
