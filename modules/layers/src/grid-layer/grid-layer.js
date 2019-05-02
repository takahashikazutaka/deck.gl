// Copyright (c) 2015 - 2017 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import {CompositeLayer, AGGREGATION_OPERATION} from '@deck.gl/core';
import GPUGridLayer from './gpu-grid-layer/gpu-grid-layer';
import CPUGridLayer from './cpu-grid-layer/cpu-grid-layer';

const defaultProps = Object.assign({}, GPUGridLayer.defaultProps, CPUGridLayer.defaultProps);

// Function to convert from getWeight/accessors props to getValue prop for Color and Elevation
function getMean(pts, accessor) {
  const filtered = pts.map(item => accessor(item)).filter(pt => Number.isFinite(pt));

  return filtered.length ? filtered.reduce((accu, curr) => accu + curr, 0) / filtered.length : null;
}

function getSum(pts, accessor) {
  const filtered = pts.map(item => accessor(item)).filter(pt => Number.isFinite(pt));

  return filtered.length ? filtered.reduce((accu, curr) => accu + curr, 0) : null;
}

function getMax(pts, accessor) {
  const filtered = pts.map(item => accessor(item)).filter(pt => Number.isFinite(pt));

  return filtered.length
    ? filtered.reduce((accu, curr) => (curr > accu ? curr : accu), -Infinity)
    : null;
}

function getMin(pts, accessor) {
  const filtered = pts.map(item => accessor(item)).filter(pt => Number.isFinite(pt));

  return filtered.length
    ? filtered.reduce((accu, curr) => (curr < accu ? curr : accu), Infinity)
    : null;
}

function getValueFunc(aggregation, accessor) {
  switch (aggregation) {
    case AGGREGATION_OPERATION.MIN:
      return pts => getMin(pts, accessor);
    case AGGREGATION_OPERATION.SUM:
      return pts => getSum(pts, accessor);
    case AGGREGATION_OPERATION.MEAN:
      return pts => getMean(pts, accessor);
    case AGGREGATION_OPERATION.MAX:
      return pts => getMax(pts, accessor);
    default:
      return null;
  }
}

export default class GridLayer extends CompositeLayer {
  initializeState() {
    this.state = {
      gpuAggregation: true
    };
  }

  updateState({oldProps, props, changeFlags}) {
    const newState = {};
    newState.gpuAggregation = this.shouldUseGPUAggregation(props);
    if (!newState.gpuAggregation) {
      // convert color and elevation accessors if needed
      const {
        colorAggregation,
        getColorWeight,
        getColorValue,
        elevationAggregation,
        getElevationWeight,
        getElevationValue
      } = props;
      const {DEFAULT_GETCOLORVALUE, DEFAULT_GETELEVATIONVALUE} = CPUGridLayer;
      newState.getColorValue =
        getColorValue && getColorValue !== DEFAULT_GETCOLORVALUE
          ? getColorValue
          : getValueFunc(colorAggregation, getColorWeight);
      newState.getElevationValue =
        getElevationValue && getElevationValue !== DEFAULT_GETELEVATIONVALUE
          ? getElevationValue
          : getValueFunc(elevationAggregation, getElevationWeight);
    }
    this.setState(newState);
  }

  renderLayers() {
    let gridLayer = null;

    if (this.state.gpuAggregation) {
      const GPULayer = this.getSubLayerClass('gpu-grid-layer', GPUGridLayer);
      // console.log('Using GPUGridLayer ####');
      gridLayer = new GPULayer(
        this.props,
        this.getSubLayerProps({
          id: 'GPU',
          // Note: data has to be passed explicitly like this to avoid being empty
          data: this.props.data
        })
      );
    } else {
      const CPULayer = this.getSubLayerClass('cpu-grid-layer', CPUGridLayer);
      // console.log('Using CPUGridLayer ----');
      const {getColorValue, getElevationValue} = this.state;
      gridLayer = new CPULayer(
        this.props,
        {
          getColorValue,
          getElevationValue
        },
        this.getSubLayerProps({
          id: 'CPU',
          // Note: data has to be passed explicitly like this to avoid being empty
          data: this.props.data
        })
      );
    }
    return [gridLayer];

    /*
    return this.props.gpuAggregation ?
    [new GPUGridLayer(
      this.props,
      this.getSubLayerProps({
        id: 'GPU',
        // Note: data has to be passed explicitly like this to avoid being empty
        data: this.props.data
      })
    )] :
    [new GridLayer(
      this.props,
      this.getSubLayerProps({
        id: 'CPU',
        // Note: data has to be passed explicitly like this to avoid being empty
        data: this.props.data
      })
    )];
*/
  }
  // Private methods
  shouldUseGPUAggregation({gpuAggregation}) {
    return gpuAggregation;
  }
}

GridLayer.layerName = 'GridLayer';
GridLayer.defaultProps = defaultProps;
