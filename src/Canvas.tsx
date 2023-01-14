
import { Component, createRef, RefObject, ClassAttributes } from 'react';

type Props = ClassAttributes<HTMLCanvasElement> & {
	width: number;
	height: number;
	onDraw?: (canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, props: Props) => void;
};

type State = {};

export class Canvas extends Component<Props,State> {
	canvasRef: RefObject<HTMLCanvasElement>

	constructor(props: Props) {
		super(props)

		this.canvasRef = createRef<HTMLCanvasElement>();
	}

	componentDidMount(): void {
		this.redraw();
	}

	componentDidUpdate(prevProps: Readonly<Props>, prevState: Readonly<State>, snapshot?: any): void {
		this.redraw();
	}

	redraw() {
		if(this.props.onDraw) {
			const canvas = this.canvasRef.current;
			if(canvas == null) {
				console.error("No canvas reference");
				return;
			}
			const context = canvas.getContext("2d");
			if(context == null) {
				console.error("No 2D rendering context");
				return;
			}
			this.props.onDraw(canvas, context, this.props);
		}
	}
	
	render() {
		console.log("Canvas.render");
		const props = {...this.props};
		delete props.onDraw;
		return <canvas {...props} ref={this.canvasRef}/>
	}
}
