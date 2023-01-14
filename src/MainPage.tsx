import {
	ButtonItem,
	PanelSection,
	PanelSectionRow,
	Router,
	ServerAPI
} from 'decky-frontend-lib';
import { VFC } from 'react';
import { Graph } from './Graph';

export const MainPage: VFC<{ serverAPI: ServerAPI }> = ({}) => {
	return (
		<PanelSection title="Panel Section">
			<PanelSectionRow>
				<Graph
					lines={[
						{
							points: [
								[2, 4],
								[3, 12],
								[4, 8],
								[5, 2],
								[6, 3]
							],
							showLabels: true
						}
					]}
					width={100}
					height={100}/>
				<ButtonItem
					layout="below"
					onClick={() => {
						Router.CloseSideMenus();
						Router.Navigate("/battery-details");
					}}>
					Battery Details
				</ButtonItem>
			</PanelSectionRow>
		</PanelSection>
	);
};
