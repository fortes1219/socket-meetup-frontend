import type { DeepPartial, Styles } from 'klinecharts';

// Based on firebit-member's kline chart palette, with softer grid/crosshair
// colors for the meetup demo dark surface.
export const KLINE_CHART_STYLES = {
  grid: {
    show: true,
    horizontal: {
      show: true,
      style: 'solid',
      size: 1,
      color: '#1F242A',
      dashedValue: []
    },
    vertical: {
      show: true,
      style: 'solid',
      size: 1,
      color: '#171C22',
      dashedValue: []
    }
  },
  candle: {
    type: 'candle_solid',
    bar: {
      upColor: '#14B886',
      downColor: '#FE204B',
      noChangeColor: '#7D7D7D',
      compareRule: 'current_open',
      upBorderColor: '#14B886',
      downBorderColor: '#FE204B',
      noChangeBorderColor: '#7D7D7D',
      upWickColor: '#14B886',
      downWickColor: '#FE204B',
      noChangeWickColor: '#7D7D7D'
    },
    priceMark: {
      last: {
        show: true,
        upColor: '#14B886',
        downColor: '#FE204B',
        noChangeColor: '#7D7D7D',
        compareRule: 'current_open',
        line: {
          show: true,
          style: 'dashed',
          size: 1,
          dashedValue: [4, 4]
        },
        text: {
          show: true,
          color: '#D7DEE8',
          size: 12,
          family: 'Roboto',
          weight: '500',
          style: 'fill',
          borderStyle: 'solid',
          borderDashedValue: [],
          borderSize: 0,
          borderColor: 'transparent',
          borderRadius: 4,
          paddingLeft: 4,
          paddingRight: 4,
          paddingTop: 2,
          paddingBottom: 2
        }
      }
    },
    tooltip: {
      showRule: 'follow_cross',
      showType: 'rect',
      rect: {
        position: 'fixed',
        color: 'rgba(15, 23, 42, 0.94)',
        borderColor: '#2B3139',
        borderSize: 1,
        borderRadius: 6,
        paddingLeft: 8,
        paddingRight: 8,
        paddingTop: 6,
        paddingBottom: 6,
        offsetLeft: 12,
        offsetTop: 12,
        offsetRight: 12,
        offsetBottom: 12
      },
      title: {
        show: true,
        color: '#D7DEE8',
        size: 12,
        family: 'Roboto',
        weight: '500',
        marginLeft: 0,
        marginTop: 0,
        marginRight: 0,
        marginBottom: 6
      },
      legend: {
        color: '#94959E',
        size: 12,
        family: 'Roboto',
        weight: '400',
        marginLeft: 0,
        marginTop: 0,
        marginRight: 0,
        marginBottom: 2,
        defaultValue: '--'
      }
    }
  },
  indicator: {
    bars: [
      {
        style: 'fill',
        upColor: '#138763',
        downColor: '#B81C3A',
        noChangeColor: '#7D7D7D',
        borderSize: 0,
        borderStyle: 'solid',
        borderDashedValue: []
      }
    ]
  },
  xAxis: {
    show: true,
    size: 'auto',
    axisLine: {
      show: true,
      color: '#2B3139',
      size: 1
    },
    tickText: {
      show: true,
      color: '#94959E',
      family: 'Roboto',
      weight: '400',
      size: 12,
      marginStart: 4,
      marginEnd: 4
    },
    tickLine: {
      show: true,
      color: '#2B3139',
      size: 1,
      length: 3
    }
  },
  yAxis: {
    show: true,
    size: 'auto',
    axisLine: {
      show: true,
      color: '#2B3139',
      size: 1
    },
    tickText: {
      show: true,
      color: '#94959E',
      family: 'Roboto',
      weight: '400',
      size: 12,
      marginStart: 4,
      marginEnd: 4
    },
    tickLine: {
      show: false,
      color: '#2B3139',
      size: 1,
      length: 3
    }
  },
  separator: {
    size: 1,
    color: '#2B3139',
    fill: true,
    activeBackgroundColor: 'rgba(230, 230, 230, 0.12)'
  },
  crosshair: {
    show: true,
    horizontal: {
      show: true,
      line: {
        show: true,
        style: 'dashed',
        size: 1,
        color: '#3B4654',
        dashedValue: [4, 4]
      },
      text: {
        show: true,
        color: '#D7DEE8',
        size: 12,
        family: 'Roboto',
        weight: '400',
        style: 'fill',
        borderStyle: 'solid',
        borderDashedValue: [],
        borderSize: 0,
        borderColor: 'transparent',
        borderRadius: 4,
        backgroundColor: '#202832',
        paddingLeft: 4,
        paddingRight: 4,
        paddingTop: 2,
        paddingBottom: 2
      },
      features: []
    },
    vertical: {
      show: true,
      line: {
        show: true,
        style: 'dashed',
        size: 1,
        color: '#3B4654',
        dashedValue: [4, 4]
      },
      text: {
        show: true,
        color: '#D7DEE8',
        size: 12,
        family: 'Roboto',
        weight: '400',
        style: 'fill',
        borderStyle: 'solid',
        borderDashedValue: [],
        borderSize: 0,
        borderColor: 'transparent',
        borderRadius: 4,
        backgroundColor: '#202832',
        paddingLeft: 4,
        paddingRight: 4,
        paddingTop: 2,
        paddingBottom: 2
      }
    }
  }
} satisfies DeepPartial<Styles>;
