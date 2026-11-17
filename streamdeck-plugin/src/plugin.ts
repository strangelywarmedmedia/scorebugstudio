import streamDeck from "@elgato/streamdeck";

import { Bases } from "./actions/bases.js";
import { Banner } from "./actions/banner.js";
import { Clock } from "./actions/clock.js";
import { Counter } from "./actions/counter.js";
import { Game } from "./actions/game.js";
import { Period } from "./actions/period.js";
import { PeriodLabel } from "./actions/periodlabel.js";
import { Card } from "./actions/card.js";
import { Shootout } from "./actions/shootout.js";
import { Possession } from "./actions/possession.js";
import { Score } from "./actions/score.js";
import { Timeout } from "./actions/timeout.js";
import { Visibility } from "./actions/show.js";
import { scorebug } from "./client.js";

streamDeck.logger.setLevel("info");

for (const a of [new Score(), new Clock(), new Visibility(), new Banner(), new Period(), new Possession(), new Timeout(), new Counter(), new Bases(), new Game(), new PeriodLabel(), new Card(), new Shootout()]) {
	streamDeck.actions.registerAction(a);
}

streamDeck.connect().then(() => scorebug.start());
