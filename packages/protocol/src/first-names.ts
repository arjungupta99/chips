/**
 * The first name a new agent gets in a room asked of its harness from the + (ADR 0150): picked as
 * the room is made, held for the harness while it waits for the first message, and taken by the
 * agent the harness makes on it, so the room says "Milo and Theo are here" and they stay Milo and
 * Theo. The server picks it and keeps one a person's device proposed when it is free; the devices
 * propose one so the room is drawn with it at once.
 *
 * Men's first names, on Arjun's word, three to six letters, easy to say and to type after an @.
 * Left out: the names of AI products (Claude, Jules, Leo, Devin, Jarvis, Watson, Hal, Grok), names
 * that are everyday words (Will, Rich, Mark, Bill, Frank, Grant, Drew, Art, Dean, Pat, Rob), and the
 * harnesses' own (Jacobian, OpenClaw, Scout, Hermes, Goose). A name somebody in the workspace has is
 * taken like any other.
 */

import { clashKey, freeAgentName, nameProblem, notAnAgentName } from "./names.js";

export const AGENT_FIRST_NAMES: readonly string[] = [
  "Abel Aldo Amir Amos Anders Ansel Anton Ari Arlo Arne Aron Arvid Asher Avi Axel Aziz",
  "Basil Beau Benji Benno Bilal Bjorn Blaise Boaz Bodhi Boris Bram Bruno Byron",
  "Cai Caleb Calum Caspar Cato Cedric Cian Ciro Clyde Colm Conor Cosmo Cyrus",
  "Dag Dante Dario Darius Dax Declan Diego Dima Dmitri Dorian Dov Duncan",
  "Edgar Elan Eli Elias Elio Emil Emmet Ennio Enzo Erik Evren Ewan Ezra",
  "Fabio Fausto Felix Fenn Ferris Finn Fitz Florin Floyd Franz",
  "Gael Galen Gareth Gideon Gil Gino Goran Grady Guido Gunnar Gus",
  "Hamish Hamza Hank Hans Harvey Hassan Hector Henrik Hiro Hollis Hugo Huxley",
  "Ian Idris Igor Ike Ilan Imre Ingo Ira Isaac Ivan Ivar Ivo",
  "Jago Jamal Jasper Javier Jem Jens Jiro Joel Jonah Jorge Joss Jude",
  "Kai Kamal Karim Kasper Kenji Kian Kieran Klaus Knox Koa Kofi Kurt",
  "Laszlo Lars Leif Leon Lev Lionel Lior Louis Lucca Lucien Luis Lyle",
  "Mads Magnus Malik Marco Marlo Mateo Mattis Mauro Milo Miro Moses Musa",
  "Nadir Nash Naveen Ned Nelson Nestor Niall Nico Nigel Nils Noah Nuri",
  "Odin Olaf Oliver Omar Oren Orson Osman Oscar Otis Otto Owen Ozzie",
  "Pablo Paolo Pascal Pavel Pedro Percy Perrin Philo Pierre Piet",
  "Qadir Quincy Quinn",
  "Rafa Ramon Raul Ravi Remy Reza Rhys Rio Rocco Rowan Ruben Rudy Rumi",
  "Sami Sanjay Santo Saul Sergio Seth Silas Simon Soren Stefan Sven",
  "Taj Tariq Tate Teddy Theo Thor Tiago Tobias Toby Tomas Tycho",
  "Ugo Ulf Ulric Umar Uri",
  "Valo Vance Vasco Vaughn Victor Vidal Viggo Vik Vinny Vito Vlad",
  "Waldo Walt Warren Wendel Wes Wilder Willem Wim Wyatt Wynn",
  "Xander Xavi Xavier",
  "Yann Yaro Yosef Yuri Yusuf Yves",
  "Zaid Zane Zeke Zeno Zev Ziggy",
].flatMap((line) => line.split(" "));

/** A name's first letter, as two names in one room are told apart by their faces. */
function initialOf(name: string): string {
  return clashKey(name).charAt(0);
}

/**
 * A first name for a new agent, off the list: one nobody has (`taken`, as clash keys: the
 * workspace's people, its active agents and the names other rooms hold), and, while there is
 * one, whose first letter nobody in the room has (`beside`, the names there), picked at random
 * among those so the names are not handed out in order. With every name taken, a numbered one,
 * "Milo 2", as Chips numbers any clash (ADR 0091). `random` is `Math.random` but in a test.
 */
export function pickAgentName(
  taken: ReadonlySet<string>,
  beside: readonly string[] = [],
  random: () => number = Math.random,
): string {
  const letters = new Set(beside.map(initialOf));
  const free = AGENT_FIRST_NAMES.filter((name) => !taken.has(clashKey(name)));
  const apart = free.filter((name) => !letters.has(initialOf(name)));
  const from = apart.length > 0 ? apart : free;
  const at = (list: readonly string[]) => list[Math.floor(random() * list.length)] as string;
  if (from.length > 0) return at(from);
  return freeAgentName(at(AGENT_FIRST_NAMES), taken);
}

/**
 * Whether a name a person's device proposed may be held: a name at all, one line, nothing
 * `nameProblem` refuses, never Main or You (SEC-33), and nobody's (`taken`). Chips picks another
 * when it is not.
 */
export function mayHoldName(name: unknown, taken: ReadonlySet<string>): name is string {
  if (typeof name !== "string") return false;
  const trimmed = name.trim();
  return (
    trimmed !== "" &&
    trimmed.length <= 40 &&
    !/\n/.test(trimmed) &&
    nameProblem(trimmed) === undefined &&
    !notAnAgentName(trimmed) &&
    !taken.has(clashKey(trimmed))
  );
}
