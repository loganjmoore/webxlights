/*{
  "DESCRIPTION": "Chasing lights running left to right along the roofline",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "spacing", "TYPE": "float", "MIN": 0.05, "MAX": 0.5, "DEFAULT": 0.15 },
    { "NAME": "width", "TYPE": "float", "MIN": 0.01, "MAX": 0.3, "DEFAULT": 0.08 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float chase = mod(uv.x + TIME * speed * 0.5, spacing);
  float pulse = smoothstep(width, 0.0, abs(chase - width * 0.5));
  
  float brightness = pulse * (0.6 + 0.4 * sin(TIME * 3.0 + uv.x * 6.28));
  
  vec3 color = mix(colorA.rgb, colorB.rgb, sin(uv.x * 3.14159 + TIME) * 0.5 + 0.5);
  
  gl_FragColor = vec4(color * brightness, 1.0);
}
