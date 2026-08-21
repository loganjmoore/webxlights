/*{
  "DESCRIPTION": "Warm candle flicker with dancing orange and yellow flames",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.5, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.0, 1.0] },
    { "NAME": "flicker_speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 2.0 },
    { "NAME": "flicker_intensity", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 }
  ]
}*/

float pseudo_random(float x) {
  return fract(sin(x * 12.9898) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float t = TIME * flicker_speed;
  
  float flicker1 = pseudo_random(floor(t) + 0.0);
  float flicker2 = pseudo_random(floor(t) + 1.0);
  float blend = fract(t);
  float flicker = mix(flicker1, flicker2, smoothstep(0.0, 1.0, blend));
  
  float vertical_gradient = smoothstep(1.2, -0.2, uv.y);
  
  float intensity = mix(1.0 - flicker_intensity, 1.0, flicker);
  intensity *= vertical_gradient;
  intensity = smoothstep(0.1, 0.9, intensity);
  
  vec3 base_color = mix(colorA.rgb, colorB.rgb, flicker * 0.5 + 0.25);
  vec3 final_color = base_color * intensity;
  
  gl_FragColor = vec4(final_color, 1.0);
}
