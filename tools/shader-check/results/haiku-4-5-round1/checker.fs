/*{
  "DESCRIPTION": "Two color checkerboard pattern sliding horizontally across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 16.0, "DEFAULT": 4.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  // Apply scaling and add animation offset
  vec2 gridUv = uv * scale;
  gridUv.x += TIME * speed * 2.0;
  
  // Create checkerboard pattern
  float checker = mod(floor(gridUv.x) + floor(gridUv.y), 2.0);
  
  // Mix between the two colors based on checkerboard
  vec3 color = mix(colorA.rgb, colorB.rgb, checker);
  
  gl_FragColor = vec4(color, 1.0);
}
