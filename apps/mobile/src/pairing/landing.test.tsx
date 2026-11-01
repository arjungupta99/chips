/**
 * Landing in the space a link brought somebody into (ADR 0168): Spaces opens it once its list has
 * it, and only once.
 */

import { act, render } from "@testing-library/react-native";
import { forgetLanding, landIn, useLanding } from "./landing";

function Spaces({
  has,
  open,
}: {
  readonly has: readonly string[];
  readonly open: (id: string) => void;
}) {
  useLanding((id) => has.includes(id), open);
  return null;
}

afterEach(() => forgetLanding());

it("opens the space once it is here, and not again", async () => {
  const open = jest.fn();
  const screen = await render(<Spaces has={[]} open={open} />);
  await act(() => landIn("spc_bakery"));
  expect(open).not.toHaveBeenCalled();
  await screen.rerender(<Spaces has={["spc_bakery"]} open={open} />);
  expect(open).toHaveBeenCalledWith("spc_bakery");
  await screen.rerender(<Spaces has={["spc_bakery", "spc_studio"]} open={open} />);
  expect(open).toHaveBeenCalledTimes(1);
});

it("opens a space that is here already as soon as it is asked for", async () => {
  const open = jest.fn();
  await render(<Spaces has={["spc_bakery"]} open={open} />);
  await act(() => landIn("spc_bakery"));
  expect(open).toHaveBeenCalledWith("spc_bakery");
});
