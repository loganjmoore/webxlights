/*{
  "DESCRIPTION": "Ocean waves rolling across the display with foam crests",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorDeep", "TYPE": "color", "DEFAULT": [0.0, 0.2, 0.6, 1.0] },
    { "NAME": "colorShallow", "TYPE": "color", "DEFAULT": [0.0, 0.8, 1.0, 1.0] },
    { "NAME": "colorFoam", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "wavelength", "TYPE": "float", "MIN": 0.1, "MAX": 3.0, "DEFAULT": 1.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float isLine = step(RENDERSIZE.y, 1.5);
  float animCoord = mix(uv.x, uv.y, isLine);
  
  float wave1 = sin((animCoord - TIME * speed * 0.5) * wavelength * 6.28318) * 0.5 + 0.5;
  float wave2 = sin((animCoord * 0.7 - TIME * speed * 0.35) * wavelength * 6.28318) * 0.5 + 0.5;
  float wave3 = sin((animCoord * 1.3 - TIME * speed * 0.65) * wavelength * 6.28318) * 0.5 + 0.5;
  
  float waveHeight = (wave1 + wave2 * 0.6 + wave3 * 0.4) / 2.1;
  
  float foamCrest = smoothstep(0.7, 0.95, waveHeight);
  float shallowBand = smoothstep(0.3, 0.6, waveHeight);
  
  vec3 color = mix(colorDeep.rgb, colorShallow.rgb, shallowBand);
  color = mix(color, colorFoam.rgb, foamCrest);
  
  gl_FragColor = vec4(color, 1.0);
}
