/*{
  "DESCRIPTION": "Chasing lights running continuously along the roofline",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "width", "TYPE": "float", "MIN": 0.02, "MAX": 0.3, "DEFAULT": 0.1 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float chase_pos = mod(uv.x - TIME * speed * 0.5, 1.0);
  
  float dist = abs(chase_pos - 0.5);
  float light = smoothstep(width, 0.0, dist);
  
  vec3 color = mix(colorA.rgb, colorB.rgb, light);
  
  gl_FragColor = vec4(color, 1.0);
}
