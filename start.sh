#!/bin/bash

# Install dependencies using pnpm
pnpm run install:all

# Build the project using pnpm
pnpm run build:all

# (Re)start the application
pnpm run restart
