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
							lineWidth: 2,
							fill: true,
							strokeStyle: 'lightblue',
							
							dotRadius: 5,
							dotsFillStyle: 'lightblue',
							
							showLabels: true,
							labelTextAlign: 'center',
							labelFillStyle: 'white',
							labelOffsetY: -8
						}
					]}
					width={200}
					height={160}
					paddingLeft={20}
					paddingRight={20}
					gridSpacingX={1}
					gridSpacingY={1}/>
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
