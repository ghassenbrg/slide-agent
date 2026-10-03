import type React from 'react';
import {Composition, Folder, Still} from 'remotion';
import {DeckCheck} from './launch/DeckCheck';
import {Launch} from './launch/Launch';
import {Announce} from './announce/Announce';
import {Announcement} from './announcement3/Announcement';
import {AnnouncementV5} from './announcement5/Announcement';
import {Reveal as A3Reveal} from './announcement3/scenes/Reveal';
import {Brief as A3Brief} from './announcement3/scenes/Brief';
import {Direction as A3Direction} from './announcement3/scenes/Direction';
import {Architecture as A3Architecture} from './announcement3/scenes/Architecture';
import {Native as A3Native} from './announcement3/scenes/Native';
import {Range as A3Range} from './announcement3/scenes/Range';
import {Start as A3Start} from './announcement3/scenes/Start';
import {Close as A3Close} from './announcement3/scenes/Close';
import {LinkedIn} from './linkedin/LinkedIn';
import {ShowcaseCheck} from './showcase-deck/ShowcaseCheck';
import {Blank} from './launch/scenes/Blank';
import {LBuild, LCheck, LClose, LDeliver, LDescribe, LPlan, LRange, LReveal} from './launch/scenes/on-paper';
import {Promo} from './Promo';
import {Build} from './scenes/Build';
import {DirectsComputes} from './scenes/DirectsComputes';
import {Features} from './scenes/Features';
import {FitContrast} from './scenes/FitContrast';
import {Hook} from './scenes/Hook';
import {Logo} from './scenes/Logo';
import {Outro} from './scenes/Outro';
import {Showcase} from './scenes/Showcase';

export const RemotionRoot: React.FC = () => {
	return (
		<>
			<Composition id="AnnouncementV5" component={AnnouncementV5} durationInFrames={1350} fps={30} width={1080} height={1350} defaultProps={{bgm:true}} />
			<Composition id="AnnouncementV3" component={Announcement} durationInFrames={1800} fps={30} width={1080} height={1350} />
			<Folder name="Announcement-V3-Scenes">
				<Composition id="A3-Reveal" component={A3Reveal} durationInFrames={132} fps={30} width={1080} height={1350} />
				<Composition id="A3-Brief" component={A3Brief} durationInFrames={192} fps={30} width={1080} height={1350} />
				<Composition id="A3-Direction" component={A3Direction} durationInFrames={162} fps={30} width={1080} height={1350} />
				<Composition id="A3-Architecture" component={A3Architecture} durationInFrames={312} fps={30} width={1080} height={1350} />
				<Composition id="A3-Native" component={A3Native} durationInFrames={192} fps={30} width={1080} height={1350} />
				<Composition id="A3-Range" component={A3Range} durationInFrames={372} fps={30} width={1080} height={1350} />
				<Composition id="A3-Start" component={A3Start} durationInFrames={312} fps={30} width={1080} height={1350} />
				<Composition id="A3-Close" component={A3Close} durationInFrames={210} fps={30} width={1080} height={1350} />
			</Folder>
			<Composition id="Promo" component={Promo} durationInFrames={1800} fps={30} width={1080} height={1920} />
			<Composition id="Announce" component={Announce} durationInFrames={1800} fps={30} width={1080} height={1350} />
			<Composition id="LinkedIn" component={LinkedIn} durationInFrames={1500} fps={30} width={1080} height={1350} />
			<Composition id="Launch" component={Launch} durationInFrames={1800} fps={30} width={1920} height={1080} />
			<Folder name="Launch-Scenes">
				<Composition id="L-Blank" component={Blank} durationInFrames={465} fps={30} width={1920} height={1080} />
				<Composition id="L-Reveal" component={LReveal} durationInFrames={120} fps={30} width={1920} height={1080} />
				<Composition id="L-Describe" component={LDescribe} durationInFrames={150} fps={30} width={1920} height={1080} />
				<Composition id="L-Plan" component={LPlan} durationInFrames={180} fps={30} width={1920} height={1080} />
				<Composition id="L-Build" component={LBuild} durationInFrames={300} fps={30} width={1920} height={1080} />
				<Composition id="L-Check" component={LCheck} durationInFrames={150} fps={30} width={1920} height={1080} />
				<Composition id="L-Deliver" component={LDeliver} durationInFrames={150} fps={30} width={1920} height={1080} />
				<Composition id="L-Range" component={LRange} durationInFrames={135} fps={30} width={1920} height={1080} />
				<Composition id="L-Close" component={LClose} durationInFrames={150} fps={30} width={1920} height={1080} />
			</Folder>
			<Folder name="Launch-Checks">
				<Still id="DeckCheck" component={DeckCheck} width={1900} height={2700} />
				<Still id="ShowcaseCheck" component={ShowcaseCheck} width={1888} height={2700} />
			</Folder>
			<Folder name="Scenes">
				<Composition id="Hook" component={Hook} durationInFrames={165} fps={30} width={1080} height={1920} />
				<Composition id="Logo" component={Logo} durationInFrames={135} fps={30} width={1080} height={1920} />
				<Composition id="DirectsComputes" component={DirectsComputes} durationInFrames={255} fps={30} width={1080} height={1920} />
				<Composition id="Build" component={Build} durationInFrames={375} fps={30} width={1080} height={1920} />
				<Composition id="FitContrast" component={FitContrast} durationInFrames={255} fps={30} width={1080} height={1920} />
				<Composition id="Showcase" component={Showcase} durationInFrames={300} fps={30} width={1080} height={1920} />
				<Composition id="Features" component={Features} durationInFrames={195} fps={30} width={1080} height={1920} />
				<Composition id="Outro" component={Outro} durationInFrames={225} fps={30} width={1080} height={1920} />
			</Folder>
		</>
	);
};
