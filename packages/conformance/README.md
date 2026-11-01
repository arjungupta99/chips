# @chipschat/conformance

The adapter conformance kit for Chips. It starts a fake Chips that speaks the wire (the routes,
the socket, the handshake, the replay), plays the person through the golden scenario against your
harness, checks every event it sends with the protocol's own schemas, and reports the same
checklist a harness's page under Agents shows.

```sh
npm install --save-dev @chipschat/conformance
```

A harness whose adapter lives in its own repository runs the scenario from its own tests:

```ts
import { formatReport, runConformance } from "@chipschat/conformance";
import { connect } from "@chipschat/harness";

const report = await runConformance({
  subject: {
    name: "my-harness",
    start: async (address) => {
      const chips = await connect({ url: address.url, token: address.token });
      // Start your harness on `chips` here.
    },
    stop: async () => {
      // Stop it again.
    },
  },
});
if (!report.passed) throw new Error(formatReport(report).join("\n"));
```

`chips conformance custom` runs the same scenario from the command line, for a harness you start
yourself. The docs page, [Conformance](https://chipschat.ai/connect/conformance/), says what the
scenario plays and what each row of the checklist asks.
